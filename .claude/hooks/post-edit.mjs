// Claude Code PostToolUse hook for Edit|Write in a Vite+ project.
// Applies safe lint fixes and formatting to the edited file, then reports the lint
// errors that remain to Claude (exit 2, diagnostics on stderr).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const LINTABLE = new Set([
	".js",
	".jsx",
	".mjs",
	".cjs",
	".ts",
	".tsx",
	".mts",
	".cts",
	".vue",
	".svelte",
	".astro",
]);

const input = JSON.parse(readFileSync(0, "utf8"));
const filePath = input.tool_input?.file_path;
if (!filePath) process.exit(0);

// `cwd` follows Claude into worktrees; CLAUDE_PROJECT_DIR stays on the main checkout.
const file = resolve(input.cwd ?? ".", filePath);
if (!existsSync(file)) process.exit(0);

// The nearest project-local `vp`, run from its package so that install's config applies.
// No install (e.g. a fresh worktree) means nothing to do.
function findVp(from) {
	for (let dir = from; ; dir = dirname(dir)) {
		const bin = join(dir, "node_modules/.bin/vp");
		if (existsSync(bin)) return { bin, dir };
		if (dirname(dir) === dir) return undefined;
	}
}

const vp = findVp(dirname(file));
if (!vp) process.exit(0);

function run(args) {
	const result = spawnSync(vp.bin, [...args, "--no-error-on-unmatched-pattern", file], {
		cwd: vp.dir,
		encoding: "utf8",
	});
	const output = [result.stdout, result.stderr, result.error?.message].filter(Boolean).join("\n");
	return { ok: result.status === 0, output };
}

// Set the exit code rather than calling `process.exit`, which can drop the end of a
// long report still buffered in the stderr pipe.
function report(output) {
	process.stderr.write(`${output.trim()}\n`);
	process.exitCode = 2;
}

const lintable = LINTABLE.has(extname(file).toLowerCase());

// Remaining errors are ignored here; the final pass reports them with post-format lines.
// Oxlint applies one round of non-overlapping fixes and does not re-lint, so repeat until the
// file stops changing, capped at ESLint's 10 passes.
for (let pass = 0; lintable && pass < 10; pass++) {
	const before = readFileSync(file, "utf8");

	if (run(["lint", "--fix"]).ok || readFileSync(file, "utf8") === before) break;
}

// Lint fixes can leave code unformatted, so format after them.
const fmt = run(["fmt"]);
if (!fmt.ok) report(fmt.output);
else if (lintable) {
	const lint = run(["lint", "--format=agent"]);
	if (!lint.ok) report(lint.output);
}

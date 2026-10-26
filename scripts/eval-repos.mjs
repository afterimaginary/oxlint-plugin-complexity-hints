// The pinned open-source repositories the evaluations run on, and running the rule over
// them. Shared by scripts/evaluate-hints.mjs and scripts/simulate-hints.mjs.
//
// The repositories are fetched at their pinned commits into HINT_EVAL_DIR, or a folder in
// the system temp directory, never into this repository.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("..", import.meta.url));
const cache = process.env.HINT_EVAL_DIR ?? join(tmpdir(), "complexity-hint-eval");

export const repositories = [
	{
		name: "ESLint",
		url: "https://github.com/eslint/eslint",
		tag: "v9.0.0",
		commit: "e0cbc50179adac1670f4e0bd9093387a51f4f42a",
		paths: ["lib"],
	},
	{
		name: "Prettier",
		url: "https://github.com/prettier/prettier",
		tag: "3.0.0",
		commit: "186e0966b010d57a0be1185494ce772becf5dac4",
		paths: ["src"],
	},
	{
		name: "Vite",
		url: "https://github.com/vitejs/vite",
		tag: "v6.0.0",
		commit: "814120f2ad387ca3d1e16c7dd403b04ca4b97f75",
		paths: ["packages/vite/src"],
	},
	{
		name: "Excalidraw",
		url: "https://github.com/excalidraw/excalidraw",
		tag: "v0.17.0",
		commit: "ddb75850573f6fef9a0786ced32ae63ab913f0e0",
		paths: ["src"],
	},
];

// Vite+ sets `VP_VERSION`, which makes Oxlint read configs as Vite+ configs; `CI` and
// `FORCE_COLOR` add colors. None of them belong in a plain Oxlint run.
const { VP_VERSION: _vp, CI: _ci, FORCE_COLOR: _color, ...env } = process.env;

/**
 * `options.timeout`, in milliseconds, kills the command and throws once it's reached;
 * `options.env` replaces the environment.
 */
export function run(command, args, cwd, { timeout, env: replaced } = {}) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		env: replaced ?? env,
		maxBuffer: 1 << 28,
		timeout,
	});

	if (result.error) {
		throw result.error;
	}

	return result;
}

/** The repository's checkout at its pinned commit, fetched if it isn't there yet. */
export function checkout(repository) {
	const dir = join(cache, repository.name.toLowerCase());
	const head = existsSync(dir) ? run("git", ["rev-parse", "HEAD"], dir).stdout.trim() : "";

	if (head === repository.commit) {
		// A run that was stopped can leave a rewritten copy behind, which would be linted.
		run("git", ["clean", "-fdq"], dir);

		return dir;
	}

	rmSync(dir, { recursive: true, force: true });

	mkdirSync(dir, { recursive: true });

	run("git", ["init", "-q"], dir);

	for (const args of [
		["fetch", "-q", "--depth", "1", repository.url, repository.commit],
		["-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD"],
	]) {
		const step = run("git", args, dir);

		if (step.status !== 0) {
			throw new Error(`Couldn't check out ${repository.name}: ${step.stderr}`);
		}
	}

	return dir;
}

const configs = new Map();

/**
 * A config with one rule on, at `max`, and nothing else: by default the rule from this
 * repository's source.
 */
function config({ max, plugin = join(root, "src/index.ts"), rule = "cognitive-complexity" }) {
	const key = JSON.stringify({ max, plugin, rule });

	if (!configs.has(key)) {
		// Named by what's in it, so runs at the same time never lint with another's config.
		const name = createHash("sha256").update(key).digest("hex").slice(0, 12);
		const file = join(cache, `oxlintrc-${name}.json`);

		mkdirSync(cache, { recursive: true });

		writeFileSync(
			file,
			JSON.stringify({
				jsPlugins: [{ name: "complexity", specifier: plugin }],
				categories: { correctness: "off" },
				rules: { [`complexity/${rule}`]: ["error", max] },
			}),
		);

		configs.set(key, file);
	}

	return configs.get(key);
}

/** Oxlint's JSON report for `paths` in `dir`, with the rule `options` describe (see `config`). */
export function lint(dir, paths, options) {
	const result = run(
		join(root, "node_modules/.bin/oxlint"),
		["-c", config(options), "--format", "json", ...paths],
		dir,
	);

	if (!result.stdout.startsWith("{")) {
		throw new Error(result.stdout + result.stderr);
	}

	return JSON.parse(result.stdout);
}

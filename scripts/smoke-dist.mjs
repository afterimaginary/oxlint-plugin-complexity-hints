// Loads the built package with plain `node`, without Vite+, checks that the plugin
// registers its rule and that both forms of the preset agree, then runs the rule
// through Oxlint and starts the checker's bin on the same Node. CI runs it on the
// oldest Node that `engines.node` allows, passing that version so a different `node` on
// PATH can't pass in its place.
import { deepStrictEqual, equal, ok } from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const [expectedNode] = process.argv.slice(2);

if (expectedNode) {
	equal(process.versions.node, expectedNode, "running on the expected Node");
}

const root = fileURLToPath(new URL("..", import.meta.url));
const { default: plugin } = await import("../dist/index.mjs");
const { default: recommended } = await import("../dist/recommended.mjs");

equal(plugin.meta.name, "complexity");

const rule = plugin.rules["cognitive-complexity"];

ok(rule?.create ?? rule?.createOnce, "cognitive-complexity is registered");

deepStrictEqual(recommended, JSON.parse(readFileSync(join(root, "recommended.json"), "utf8")));

// Loading proves the code parses on this Node; running the rule proves the APIs it calls
// exist here too.
const work = mkdtempSync(join(tmpdir(), "complexity-smoke-"));

try {
	const config = join(work, "oxlintrc.json");

	writeFileSync(
		config,
		JSON.stringify({
			jsPlugins: [join(root, "dist/index.mjs")],
			categories: { correctness: "off" },
			rules: { "complexity/cognitive-complexity": ["error", 0] },
		}),
	);

	const result = spawnSync(
		process.execPath,
		[
			join(root, "node_modules/oxlint/bin/oxlint"),
			"-c",
			config,
			"--format",
			"json",
			"tests/fixtures/cli/format.js",
		],
		{ cwd: root, encoding: "utf8" },
	);

	ok(result.stdout.startsWith("{"), result.stdout + result.stderr);

	const { diagnostics } = JSON.parse(result.stdout);

	deepStrictEqual(
		diagnostics.map(({ code }) => code),
		["complexity(cognitive-complexity)"],
	);
} finally {
	rmSync(work, { recursive: true, force: true });
}

// The checker's bin starts on this Node.
const help = spawnSync(process.execPath, [join(root, "dist/checker/cli.mjs"), "--help"], {
	encoding: "utf8",
});

equal(help.status, 0, help.stderr);

ok(help.stdout.startsWith("Usage: complexity-hints"), help.stdout);

// As a hook, a call that changed no file passes without running anything.
const hook = spawnSync(
	process.execPath,
	[join(root, "dist/checker/cli.mjs"), "--claude-code-hook"],
	{
		encoding: "utf8",
		input: JSON.stringify({ tool_name: "Bash", tool_input: { command: "ls" }, tool_response: {} }),
	},
);

equal(hook.status, 0, hook.stderr);

console.log(`Built package loads and runs on Node ${process.versions.node}.`);

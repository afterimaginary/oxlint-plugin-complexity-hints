import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "..");
const project = mkdtempSync(join(tmpdir(), "complexity-docs-"));

const { CI: _ci, FORCE_COLOR: _forceColor, ...plainEnv } = process.env;

afterAll(() => {
	rmSync(project, { recursive: true, force: true });
});

/** The contents of each fenced code block in a doc's `## <heading>` section, in order. */
function blocks(doc: string, heading: string): string[] {
	const text = readFileSync(join(root, doc), "utf8");
	const section = text.split(`\n## ${heading}\n`)[1]!.split("\n## ")[0]!;

	return [...section.matchAll(/^```\w*\n([\s\S]*?)^```$/gm)].map(([, body]) => body!);
}

/** Lints `source` as `file` with the rule from source, in the agent format. */
function lint(file: string, source: string, max?: number): string {
	mkdirSync(dirname(join(project, file)), { recursive: true });

	writeFileSync(join(project, file), source);

	const config = join(project, `${file}.oxlintrc.json`);

	writeFileSync(
		config,
		JSON.stringify({
			jsPlugins: [{ name: "complexity", specifier: join(root, "src/index.ts") }],
			categories: { correctness: "off" },
			rules: { "complexity/cognitive-complexity": max === undefined ? "error" : ["error", max] },
		}),
	);

	return spawnSync(
		join(root, "node_modules/.bin/oxlint"),
		["-c", config, "--format", "agent", file],
		{ cwd: project, encoding: "utf8", env: { ...plainEnv, NO_COLOR: "1" } },
	).stdout;
}

// Each diagnostic shown in the docs is the one the rule gives for the code beside it, so a
// change to scoring or wording can't leave the docs out of date.
describe("the docs' diagnostics are the rule's real output", () => {
	test("README example, at the default max", () => {
		const [source, output] = blocks("README.md", "Example");

		expect(lint("src/shipping.js", source!)).toBe(output);
	});

	test("rule docs message, for the 'What counts' example at max 5", () => {
		const [source] = blocks("docs/rules/cognitive-complexity.md", "What counts");
		const [message] = blocks("docs/rules/cognitive-complexity.md", "The message");

		expect(lint("find-user.js", source!, 5)).toContain(
			`error complexity(cognitive-complexity): ${message}`,
		);
	});
});

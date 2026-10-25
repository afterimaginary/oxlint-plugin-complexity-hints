import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { OxlintConfig } from "oxlint";
import { afterAll, describe, expect, test } from "vite-plus/test";
import recommended from "../src/recommended.ts";

const root = join(import.meta.dirname, "..");
const project = mkdtempSync(join(tmpdir(), "complexity-docs-"));

// Oxlint turns on colors and a Unicode code frame under `CI` or `FORCE_COLOR`, even with
// `NO_COLOR` set, so neither reaches it.
const { CI: _ci, FORCE_COLOR: _forceColor, ...plainEnv } = process.env;

/** The plugin from source, under the name the preset gives it. */
const plugin = { name: "complexity", specifier: join(root, "src/index.ts") };

afterAll(() => {
	rmSync(project, { recursive: true, force: true });
});

/** The contents of each fenced code block in a doc's `## <heading>` section, in order. */
function blocks(doc: string, heading: string): string[] {
	const section = readFileSync(join(root, doc), "utf8").split(`\n## ${heading}\n`)[1];

	if (section === undefined) {
		throw new Error(`${doc} has no "## ${heading}" section`);
	}

	const found = [...section.split("\n## ")[0]!.matchAll(/^```\w*\n([\s\S]*?)^```$/gm)];

	if (found.length === 0) {
		throw new Error(`${doc} has no code blocks under "## ${heading}"`);
	}

	return found.map(([, body]) => body!);
}

/** Lints `source`, written to `file`, with `config`, in the agent format. */
function lint(file: string, source: string, config: OxlintConfig): string {
	mkdirSync(dirname(join(project, file)), { recursive: true });

	writeFileSync(join(project, file), source);

	const configFile = join(project, `${file}.oxlintrc.json`);

	writeFileSync(configFile, JSON.stringify(config));

	const result = spawnSync(
		join(root, "node_modules/.bin/oxlint"),
		["-c", configFile, "--format", "agent", file],
		{
			cwd: project,
			encoding: "utf8",
			timeout: 30_000,
			env: { ...plainEnv, NO_COLOR: "1" },
		},
	);

	if (result.error) {
		throw result.error;
	}

	return result.stdout;
}

// Each diagnostic shown in the docs is the one the rule gives for the code beside it, so a
// change to scoring or wording can't leave the docs out of date.
describe("the docs' diagnostics are the rule's real output", () => {
	test("README example, with the recommended preset", () => {
		const [source, output] = blocks("README.md", "Example");

		expect(
			lint("src/shipping.js", source!, { jsPlugins: [plugin], rules: recommended.rules }),
		).toBe(output);
	});

	test("rule docs message, for the 'What counts' example at max 5", () => {
		const [source] = blocks("docs/rules/cognitive-complexity.md", "What counts");
		const [message] = blocks("docs/rules/cognitive-complexity.md", "The message");

		const output = lint("find-user.js", source!, {
			jsPlugins: [plugin],
			categories: { correctness: "off" },
			rules: { "complexity/cognitive-complexity": ["error", 5] },
		});

		expect(output).toContain(`error complexity(cognitive-complexity): ${message}`);
	});
});

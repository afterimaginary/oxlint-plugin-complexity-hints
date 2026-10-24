import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "oxlint";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import recommended from "../src/recommended.ts";

const root = join(import.meta.dirname, "..");
const project = mkdtempSync(join(tmpdir(), "complexity-preset-"));

// Vite+ sets `VP_VERSION` for the commands it runs, and with it Oxlint reads
// `oxlint.config.ts` as a Vite+ config, with its settings under `lint`. A consumer
// running plain Oxlint doesn't have it.
const { VP_VERSION: _vpVersion, ...consumerEnv } = process.env;

// Type-checked with the repository: the typed export must fit `extends` as it is.
const typed = defineConfig({ extends: [recommended] });

/** A function over the default max, one at `max-params`, and one over it. */
const input = `export function deep(a1, a2, a3, a4, a5) {
	if (a1) { if (a2) { if (a3) { if (a4) { if (a5) { if (a1) { log(); } } } } } }
}

export function wide(a, b, c, d, e, f) {
	return a + b + c + d + e + f;
}
`;

/** A project with the package installed under node_modules, as a consumer would have it. */
beforeAll(() => {
	// Writes dist/ and recommended.json, which the installed package serves. The JSON goes
	// first, so a build that stops writing it can't pass on one from an earlier build.
	rmSync(join(root, "recommended.json"), { force: true });

	const build = spawnSync(join(root, "node_modules/.bin/vp"), ["pack"], {
		cwd: root,
		encoding: "utf8",
	});

	expect(build.status, build.stderr).toBe(0);

	mkdirSync(join(project, "node_modules"));

	symlinkSync(root, join(project, "node_modules/complexity-plugin-oxlint"));

	symlinkSync(join(root, "node_modules/oxlint"), join(project, "node_modules/oxlint"));

	writeFileSync(join(project, "package.json"), '{ "type": "module" }\n');

	writeFileSync(join(project, "input.js"), input);

	writeFileSync(
		join(project, "oxlintrc.json"),
		'{ "extends": ["./node_modules/complexity-plugin-oxlint/recommended.json"] }\n',
	);

	writeFileSync(
		join(project, "oxlint.config.ts"),
		[
			'import { defineConfig } from "oxlint";',
			'import recommended from "complexity-plugin-oxlint/recommended";',
			"",
			"export default defineConfig({ extends: [recommended] });",
			"",
		].join("\n"),
	);
});

afterAll(() => {
	rmSync(project, { recursive: true, force: true });
});

/** The rule and line of each diagnostic, in line order. */
function lint(config: string): string[] {
	const result = spawnSync(
		join(root, "node_modules/.bin/oxlint"),
		["-c", config, "--format", "json", "input.js"],
		{ cwd: project, encoding: "utf8", env: consumerEnv },
	);

	const { diagnostics } = JSON.parse(result.stdout) as {
		diagnostics: { code: string; labels: { span: { line: number } }[] }[];
	};

	return diagnostics
		.map(({ code, labels }) => `${labels[0]!.span.line} ${code}`)
		.sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
}

describe("the recommended preset", () => {
	test("enables cognitive-complexity at its default max and max-params at 5", () => {
		expect(typed.extends).toEqual([recommended]);

		expect(lint("oxlintrc.json")).toEqual([
			"1 complexity(cognitive-complexity)",
			"5 eslint(max-params)",
		]);
	});

	test("is the same through recommended.json and the typed export", () => {
		expect(lint("oxlint.config.ts")).toEqual(lint("oxlintrc.json"));
	});
});

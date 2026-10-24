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

/** Functions just over and at the default max of 15, and just over and at `max-params` at 5. */
const input = `export function overMax(a, b, c, d, e) {
${"\tif (a) log(b, c, d, e);\n".repeat(16)}}

export function atMax(a) {
${"\tif (a) log(a);\n".repeat(15)}}

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

	// When Oxlint can't load the config, it prints why instead of the JSON.
	if (!result.stdout.startsWith("{")) {
		throw new Error(result.stdout + result.stderr);
	}

	const { diagnostics } = JSON.parse(result.stdout) as {
		diagnostics: { code: string; labels: { span: { line: number } }[] }[];
	};

	return diagnostics
		.map(({ code, labels }) => `${labels[0]!.span.line} ${code}`)
		.sort((a, b) => Number.parseInt(a) - Number.parseInt(b));
}

describe("the recommended preset", () => {
	test("enables cognitive-complexity at its default max and max-params at 5", () => {
		// Type-checked with the repository: the typed export must fit `extends` as it is.
		defineConfig({ extends: [recommended] });

		expect(lint("oxlintrc.json")).toEqual([
			"1 complexity(cognitive-complexity)",
			"38 eslint(max-params)",
		]);
	});

	test("is the same through recommended.json and the typed export", () => {
		expect(lint("oxlint.config.ts")).toEqual(lint("oxlintrc.json"));
	});

	// The published declarations, not the source: a build that widened `"error"` to
	// `string` would fail here.
	test("type-checks in a strict oxlint.config.ts, as installed", () => {
		const tsc = spawnSync(
			join(root, "node_modules/.bin/tsc"),
			["--noEmit", "--strict", "--module", "nodenext", "--skipLibCheck", "oxlint.config.ts"],
			{ cwd: project, encoding: "utf8" },
		);

		expect(tsc.status, tsc.stdout).toBe(0);
	});
});

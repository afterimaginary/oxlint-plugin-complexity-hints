import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import tsParser from "@typescript-eslint/parser";
import { Linter } from "eslint";
import sonarjs from "eslint-plugin-sonarjs";
import { describe, expect, test } from "vite-plus/test";
import { reports, rule, tester } from "./helpers.ts";

const fixtures = join(import.meta.dirname, "fixtures");

/**
 * A fixture whose first line is `// @expect line:column=total, ...` pins its own
 * expectations instead of using the oracle. Reserved for the deviations listed in
 * docs/specs/scoring.md, where eslint-plugin-sonarjs is knowingly wrong.
 */
const PINNED = /^\/\/ @expect ([^\n(]+)/;

const linter = new Linter();

/** Every report eslint-plugin-sonarjs makes at threshold 0, as `line:column=total`. */
function oracle(file: string, code: string): string[] {
	const extension = extname(file);

	const messages = linter.verify(
		code,
		{
			files: ["**/*.{js,cjs,jsx,ts,tsx}"],
			languageOptions: {
				parser: tsParser,
				sourceType: extension === ".cjs" ? "script" : "module",
				parserOptions: { ecmaFeatures: { jsx: extension === ".jsx" || extension === ".tsx" } },
			},
			plugins: { sonarjs },
			rules: { "sonarjs/cognitive-complexity": ["error", 0] },
		},
		file,
	);

	return messages.map((message) => {
		const total = /from (\d+) to/.exec(message.message)?.[1];

		// A parse error or config miss must fail the fixture, not shrink it to nothing.
		if (message.ruleId !== "sonarjs/cognitive-complexity" || !total) {
			throw new Error(`${file}:${message.line}:${message.column}: ${message.message}`);
		}

		return `${message.line}:${message.column}=${total}`;
	});
}

const cases = readdirSync(fixtures)
	.filter((file) => /\.(js|cjs|jsx|ts|tsx)$/.test(file))
	.sort()
	.map((file) => {
		const code = readFileSync(join(fixtures, file), "utf8");

		const pinned = PINNED.exec(code)?.[1]
			?.split(",")
			.map((entry) => entry.trim());

		return {
			file,
			code,
			pinned,
			oracle: oracle(file, code),
		};
	});

describe("oracle", () => {
	test("has a fixture corpus", () => {
		expect(cases.length).toBeGreaterThanOrEqual(10);
	});

	// Pinned fixtures exist only because the oracle disagrees; once it agrees,
	// the file belongs back under the oracle.
	for (const { file, pinned, oracle: reported } of cases) {
		if (pinned) {
			test(`${file}: eslint-plugin-sonarjs still differs from the pinned totals`, () => {
				expect(reported.sort()).not.toEqual([...pinned].sort());
			});
		}
	}
});

tester.run("cognitive-complexity matches eslint-plugin-sonarjs", rule, {
	valid: cases
		.filter(({ pinned, oracle: reported }) => (pinned ?? reported).length === 0)
		.map(({ file, code }) => ({
			name: file,
			filename: file,
			code,
			options: [0],
		})),
	invalid: cases
		.filter(({ pinned, oracle: reported }) => (pinned ?? reported).length > 0)
		.map(({ file, code, pinned, oracle: reported }) => ({
			name: pinned ? `${file} (pinned)` : file,
			filename: file,
			code,
			options: [0],
			errors: reports(pinned ?? reported),
		})),
});

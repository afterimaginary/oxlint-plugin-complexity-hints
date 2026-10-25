import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { reports, rule, tester } from "./helpers.ts";
import { oracle } from "./sonarjs.ts";

const fixtures = join(import.meta.dirname, "fixtures");

/**
 * A fixture whose first line is `// @expect line:column=total, ...` pins those
 * functions' totals in place of the oracle's; every other function in it is still
 * compared with sonarjs. Reserved for the deviations listed in docs/specs/scoring.md,
 * where eslint-plugin-sonarjs is knowingly wrong.
 */
const PINNED = /^\/\/ @expect ([^\n(]+)/;

/** `line:column` of a `line:column=total` entry. */
const position = (entry: string) => entry.split("=")[0];

const cases = readdirSync(fixtures)
	.filter((file) => /\.(js|cjs|jsx|ts|tsx)$/.test(file))
	.sort()
	.map((file) => {
		const code = readFileSync(join(fixtures, file), "utf8");

		const pinned =
			PINNED.exec(code)?.[1]
				?.split(",")
				.map((entry) => entry.trim()) ?? [];

		const reported = oracle(file, code);
		const pins = new Map(pinned.map((entry) => [position(entry), entry]));

		return {
			file,
			code,
			pinned,
			reported,
			// In place, so the reports stay in sonarjs's line and column order.
			expected: reported.map((entry) => pins.get(position(entry)) ?? entry),
		};
	});

describe("oracle", () => {
	test("has a fixture corpus", () => {
		expect(cases.length).toBeGreaterThanOrEqual(10);
	});

	// A pin exists only because the oracle disagrees; once it agrees, drop the pin.
	for (const { file, pinned, reported } of cases) {
		for (const entry of pinned) {
			test(`${file}: eslint-plugin-sonarjs still differs from the pin ${entry}`, () => {
				expect(reported.map(position)).toContain(position(entry));

				expect(reported).not.toContain(entry);
			});
		}
	}
});

tester.run("cognitive-complexity matches eslint-plugin-sonarjs", rule, {
	valid: cases
		.filter(({ expected }) => expected.length === 0)
		.map(({ file, code }) => ({
			name: file,
			filename: file,
			code,
			options: [0],
		})),
	invalid: cases
		.filter(({ expected }) => expected.length > 0)
		.map(({ file, code, pinned, expected }) => ({
			name: pinned.length > 0 ? `${file} (with pins)` : file,
			filename: file,
			code,
			options: [0],
			errors: reports(expected),
		})),
});

import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vite-plus/test";
import rule from "../src/rules/cognitive-complexity.ts";

RuleTester.describe = describe;

RuleTester.it = it;

export const tester = new RuleTester({ languageOptions: { parserOptions: { lang: "tsx" } } });

export { rule };

/** The rule's message for a unit scoring `total` against `max`. */
export function message(total: number, max = 0): string {
	return `Cognitive complexity of this function is ${total}, over the max of ${max}.`;
}

/**
 * One expected report per `"line:column=total"` entry, with the column 1-based as the
 * Oxlint CLI prints it.
 */
export function reports(expected: readonly string[], max = 0) {
	return expected.map((entry) => {
		const [, line, column, total] = /^(\d+):(\d+)=(\d+)$/.exec(entry) ?? [];

		if (!total) {
			throw new Error(`Malformed expectation: ${entry}`);
		}

		// RuleTester columns are 0-based.
		return { message: message(Number(total), max), line: Number(line), column: Number(column) - 1 };
	});
}

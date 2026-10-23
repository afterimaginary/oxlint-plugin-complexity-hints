import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reports, rule, tester } from "./helpers.ts";

// The whitepaper's own totals, as adjusted by ADR-0002 (see the fixture's header).
// oracle.test.ts also checks this fixture against eslint-plugin-sonarjs; these
// expectations hold even if a sonarjs release changes its scoring.
tester.run("cognitive-complexity whitepaper examples", rule, {
	valid: [],
	invalid: [
		{
			name: "whitepaper.js",
			code: readFileSync(join(import.meta.dirname, "fixtures/whitepaper.js"), "utf8"),
			options: [0],
			errors: reports([
				"11:10=1", // getWords
				"24:10=7", // sumOfPrimes
				"37:10=9", // myMethod
				"54:15=1", // the arrow in myMethod2; myMethod2 itself scores 0
				"62:10=19", // overriddenSymbolFrom
				"89:10=19", // toRegexp
				"124:2=1", // model.save
				"131:33=3", // the _validate callback
				"136:59=7", // the sync callback
			]),
		},
	],
});

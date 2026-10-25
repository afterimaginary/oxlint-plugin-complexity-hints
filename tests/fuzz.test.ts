import fc from "fast-check";
import { RuleTester } from "oxlint/plugins-dev";
import { test } from "vite-plus/test";
import { reports, rule, tester } from "./helpers.ts";
import { programs } from "./programs.ts";
import { oracle } from "./sonarjs.ts";

/**
 * The same seed and case count on every run, so `verify` is deterministic. Set
 * `FUZZ_SEED` and `FUZZ_RUNS` to explore further; a failure prints the seed and the
 * shrunk program, which becomes a fixture in tests/fixtures/ (or a pinned deviation).
 */
const seed = Number(process.env.FUZZ_SEED ?? 20_260_901);
const numRuns = Number(process.env.FUZZ_RUNS ?? 1000);

// Each program is one RuleTester run inside the property, so a mismatch throws there and
// fast-check can shrink it, rather than registering a test of its own.
RuleTester.describe = (_name, run) => run();

RuleTester.it = (_name, run) => run();

/** Throws unless this rule reports exactly what eslint-plugin-sonarjs reports. */
function agrees(code: string): void {
	const expected = oracle("fuzz.jsx", code);
	const base = { filename: "fuzz.jsx", code, options: [0] };

	tester.run("cognitive-complexity", rule, {
		valid: expected.length === 0 ? [base] : [],
		invalid: expected.length > 0 ? [{ ...base, errors: reports(expected) }] : [],
	});
}

test("random programs score the same as eslint-plugin-sonarjs", { timeout: 120_000 }, () => {
	fc.assert(fc.property(programs, agrees), { seed, numRuns });
});

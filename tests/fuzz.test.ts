import fc from "fast-check";
import { RuleTester } from "oxlint/plugins-dev";
import { test } from "vite-plus/test";
import { reports, rule, tester } from "./helpers.ts";
import { programs } from "./programs.ts";
import { oracle } from "./sonarjs.ts";

/** A positive integer from the environment, or `fallback` when it isn't set. */
function setting(name: string, fallback: number): number {
	const raw = process.env[name];
	const value = raw === undefined ? fallback : Number(raw);

	if (!Number.isInteger(value) || value < 1) {
		throw new Error(`${name} must be a positive integer, not "${raw}"`);
	}

	return value;
}

/**
 * The same seed and case count on every run, so `verify` is deterministic. Set
 * `FUZZ_SEED` and `FUZZ_RUNS` to explore further. A failure prints the seed, the path
 * and the shrunk program, which becomes a fixture (see CONTRIBUTING.md).
 */
const seed = setting("FUZZ_SEED", 20_260_901);
const numRuns = setting("FUZZ_RUNS", 1000);

// Each program is one RuleTester run inside the property, so a mismatch throws there and
// fast-check can shrink it, rather than registering a test of its own. This replaces the
// vitest hooks that helpers.ts installs, so it has to come after that import; vitest
// isolates test files, so other files keep theirs.
RuleTester.describe = (_name, run) => run();

RuleTester.it = (_name, run) => run();

/** Throws unless this rule reports exactly what eslint-plugin-sonarjs reports. */
function agrees(code: string): void {
	const expected = oracle("fuzz.tsx", code);
	const base = { filename: "fuzz.tsx", code, options: [0] };

	tester.run("cognitive-complexity", rule, {
		valid: expected.length === 0 ? [base] : [],
		invalid: expected.length > 0 ? [{ ...base, errors: reports(expected) }] : [],
	});
}

// About a millisecond a program, with room for shrinking a failure.
test(
	"random programs score the same as eslint-plugin-sonarjs",
	{ timeout: 60_000 + numRuns * 10 },
	() => {
		fc.assert(fc.property(programs, agrees), { seed, numRuns });
	},
);

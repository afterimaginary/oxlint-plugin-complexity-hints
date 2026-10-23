import { reports, rule, tester } from "./helpers.ts";

/** A function scoring exactly `total`: one flat `if` per point. */
function scoring(total: number): string {
	return `function f(a) {\n${"\tif (a) {}\n".repeat(total)}}\n`;
}

tester.run("cognitive-complexity options", rule, {
	valid: [
		{ name: "default max allows 15", code: scoring(15) },
		{ name: "a score equal to max is not reported", code: scoring(3), options: [3] },
		{ name: "object form", code: scoring(3), options: [{ max: 3 }] },
	],
	invalid: [
		{
			name: "default max reports 16",
			code: scoring(16),
			errors: reports(["1:10=16"], 15),
		},
		{
			name: "bare number",
			code: scoring(4),
			options: [3],
			errors: reports(["1:10=4"], 3),
		},
		{
			name: "object form",
			code: scoring(4),
			options: [{ max: 3 }],
			errors: reports(["1:10=4"], 3),
		},
	],
});

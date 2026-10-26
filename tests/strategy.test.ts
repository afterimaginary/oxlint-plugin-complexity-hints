import { createRule } from "../src/rules/cognitive-complexity.ts";
import { rule, tester } from "./helpers.ts";

// The guard clause saves 2 (the `for` and the inner `if` move up a level), leaving 4. Moving
// the outer `if`'s body leaves 1 here and 3 in the new function.
const guardOrMove = `function f(a, xs) {
	if (a) {
		for (const x of xs) {
			if (x) {
				log(x);
			}
		}
	}
}
`;

// The same, but a closure in the body writes `a`, so no region around it can move.
const guardOnly = guardOrMove.replace(
	"log(x);",
	"xs.forEach(() => {\n\t\t\t\t\ta = x;\n\t\t\t\t});",
);

const guard =
	/fix: invert the 'if' at line 2 into a guard clause that returns early, so its body moves up a level; this one drops to 4\.$/;

const move =
	/fix: move lines 3-7 \(the body of the 'if' at line 2\) into a new function; this one drops to 1 and the new one scores 3\.$/;

tester.run("cognitive-complexity, guard if enough", rule, {
	valid: [],
	invalid: [
		{
			name: "the guard when it brings the function to the max",
			code: guardOrMove,
			options: [4],
			errors: [{ message: guard }],
		},
		{
			name: "the guard when it isn't enough but no region can move",
			code: guardOnly,
			options: [3],
			errors: [{ message: guard }],
		},
		{
			name: "otherwise the largest saving",
			code: guardOrMove,
			options: [3],
			errors: [{ message: move }],
		},
	],
});

tester.run("cognitive-complexity, guard first", createRule("guard first"), {
	valid: [],
	invalid: [
		{
			name: "a guard comes first, even when it isn't enough",
			code: guardOrMove,
			options: [0],
			errors: [{ message: guard }],
		},
	],
});

tester.run("cognitive-complexity, largest saving", createRule("largest saving"), {
	valid: [],
	invalid: [
		{
			name: "a move that leaves a lower highest score wins",
			code: guardOrMove,
			options: [0],
			errors: [{ message: move }],
		},
		{
			name: "the guard stays when no region can move",
			code: guardOnly,
			options: [0],
			errors: [{ message: guard }],
		},
	],
});

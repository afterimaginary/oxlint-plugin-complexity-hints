import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "..");
const oxlint = join(root, "node_modules/.bin/oxlint");

// Oxlint turns on colors and a Unicode code frame under `CI` or `FORCE_COLOR`, even with
// `NO_COLOR` set, so neither reaches it.
const { CI: _ci, FORCE_COLOR: _forceColor, ...plainEnv } = process.env;

/**
 * Runs the Oxlint CLI from the repository root over a file in tests/fixtures/cli/, at max 0,
 * with the config named `config` there. The format is always given: without one, Oxlint
 * picks `agent` when it detects an agent. Colors are off, so the output doesn't depend on
 * the terminal or CI.
 */
function lint(
	file: string,
	format: string,
	config = "oxlintrc.json",
): { stdout: string; status: number | null } {
	const result = spawnSync(
		oxlint,
		["-c", `tests/fixtures/cli/${config}`, "--format", format, `tests/fixtures/cli/${file}`],
		{
			cwd: root,
			encoding: "utf8",
			timeout: 30_000,
			env: { ...plainEnv, NO_COLOR: "1" },
		},
	);

	if (result.error) {
		throw result.error;
	}

	return { stdout: result.stdout, status: result.status };
}

/** Agent-format diagnostics in line order; Oxlint's own order isn't stable. */
function agentLines(
	file: string,
	{ config = "oxlintrc.json", rule = "cognitive-complexity" } = {},
): string[] {
	const line = (diagnostic: string) => Number(diagnostic.split(":")[1]);

	return lint(file, "agent", config)
		.stdout.split("\n")
		.filter((diagnostic) => diagnostic.includes(`complexity(${rule})`))
		.sort((a, b) => line(a) - line(b));
}

describe("diagnostics in --format agent", () => {
	test("name each kind of function", () => {
		expect(agentLines("labels.ts")).toMatchInlineSnapshot(`
			[
			  "tests/fixtures/cli/labels.ts:3:17: error complexity(cognitive-complexity): Function 'declared' at lines 3-6 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 4 (+1); fix: split the code around line 4 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:8:35: error complexity(cognitive-complexity): Function 'bound' at lines 8-11 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 9 (+1); fix: split the code around line 9 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:15:19: error complexity(cognitive-complexity): Function 'target.nested.f' at lines 15-18 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 16 (+1); fix: split the code around line 16 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:23:20: error complexity(cognitive-complexity): Function 'target.nested.f' at lines 23-26 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 24 (+1); fix: split the code around line 24 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:29:25: error complexity(cognitive-complexity): Method '#hidden' at lines 29-32 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 30 (+1); fix: split the code around line 30 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:34:23: error complexity(cognitive-complexity): Method 'field' at lines 34-37 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 35 (+1); fix: split the code around line 35 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:39:2: error complexity(cognitive-complexity): Method 'constructor' at lines 39-42 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 40 (+1); fix: split the code around line 40 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:44:2: error complexity(cognitive-complexity): Method 'method' at lines 44-47 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 45 (+1); fix: split the code around line 45 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:49:6: error complexity(cognitive-complexity): Method 'size' at lines 49-51 has cognitive complexity 1, over the max of 0; main contributors: '?:' at line 50 (+1); fix: split the code around line 50 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:53:3: error complexity(cognitive-complexity): Method '[computed]' at lines 53-56 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 54 (+1); fix: split the code around line 54 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:60:2: error complexity(cognitive-complexity): Method 'method' at lines 60-63 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 61 (+1); fix: split the code around line 61 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:64:25: error complexity(cognitive-complexity): Function 'property' at lines 64-67 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 65 (+1); fix: split the code around line 65 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:68:2: error complexity(cognitive-complexity): Method 'quoted key' at lines 68-71 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 69 (+1); fix: split the code around line 69 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:74:16: error complexity(cognitive-complexity): Default export function at lines 74-77 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 75 (+1); fix: split the code around line 75 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:79:15: error complexity(cognitive-complexity): Immediately invoked function at lines 79-82 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 80 (+1); fix: split the code around line 80 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:84:16: error complexity(cognitive-complexity): Callback passed to 'map' at lines 84-87 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 85 (+1); fix: split the code around line 85 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:89:23: error complexity(cognitive-complexity): Callback passed to 'Promise' at lines 89-92 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 90 (+1); fix: split the code around line 90 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:95:15: error complexity(cognitive-complexity): Anonymous function at lines 95-98 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 96 (+1); fix: split the code around line 96 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:99:2: error complexity(cognitive-complexity): Function 'named' at lines 99-102 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 100 (+1); fix: split the code around line 100 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:105:27: error complexity(cognitive-complexity): Callback at lines 105-108 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 106 (+1); fix: split the code around line 106 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:112:2: error complexity(cognitive-complexity): Method 'method' at lines 112-117 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 114 (+1); fix: split the code around line 114 into smaller functions.",
			]
		`);
	});

	test("group and rank the main contributors", () => {
		expect(agentLines("contributors.js")).toMatchInlineSnapshot(`
			[
			  "tests/fixtures/cli/contributors.js:4:17: error complexity(cognitive-complexity): Function 'flat' at lines 4-13 has cognitive complexity 4, over the max of 0; main contributors: 4 'if' at lines 5-11 (+4); fix: move lines 5-8 into a new function; this one drops to 2 and the new one scores 2.",
			  "tests/fixtures/cli/contributors.js:16:17: error complexity(cognitive-complexity): Function 'deep' at lines 16-25 has cognitive complexity 10, over the max of 0; main contributors: 'if' at line 20 (+4, nested 3 deep), 'while' at line 19 (+3, nested 2 deep), 'for...of' at line 18 (+2, nested 1 deep); fix: move lines 19-22 (the body of the 'for...of' at line 18) into a new function; this one drops to 3 and the new one scores 3.",
			  "tests/fixtures/cli/contributors.js:28:17: error complexity(cognitive-complexity): Function 'mixed' at lines 28-38 has cognitive complexity 10, over the max of 0; main contributors: 2 '?:' at line 30 (+4, nested 1 deep), 'for' at line 31 (+2, nested 1 deep), 'if' at line 29 (+1); fix: move lines 30-33 (the body of the 'if' at line 29) into a new function; it reassigns 'a', which the code around it reads, so have it return the new 'a' and assign it from the call; this one drops to 4 and the new one scores 3.",
			  "tests/fixtures/cli/contributors.js:41:17: error complexity(cognitive-complexity): Function 'chains' at lines 41-45 has cognitive complexity 4, over the max of 0; main contributors: 3 '&&' at lines 42-44 (+4); fix: move line 43 into a new function; it declares 'y', which the code after it uses, so declare 'y' before line 43, have it return 'y', and assign it from the call; this one drops to 2 and the new one scores 2.",
			  "tests/fixtures/cli/contributors.js:48:23: error complexity(cognitive-complexity): Function 'jumps' at lines 48-57 has cognitive complexity 8, over the max of 0; main contributors: 'if' at line 51 (+3, nested 2 deep), 'for...in' at line 50 (+2, nested 1 deep), 2 labeled 'continue' at lines 52-54 (+2); fix: move lines 50-55 (the body of the 'for await...of' at line 49) into a new function; this one drops to 1 and the new one scores 3.",
			  "tests/fixtures/cli/contributors.js:59:23: error complexity(cognitive-complexity): Function 'awaitLoop' at lines 59-62 has cognitive complexity 1, over the max of 0; main contributors: 'for await...of' at line 60 (+1); fix: split the code around line 60 into smaller functions.",
			  "tests/fixtures/cli/contributors.js:65:17: error complexity(cognitive-complexity): Function 'ties' at lines 65-74 has cognitive complexity 6, over the max of 0; main contributors: 2 'else if' at lines 67-68 (+2), 'if' at line 71 (+2, nested 1 deep), 'if' at line 66 (+1); fix: move lines 66-69 into a new function; this one drops to 3 and the new one scores 3.",
			]
		`);
	});

	test("suggest one change", () => {
		expect(agentLines("fixes.js")).toMatchInlineSnapshot(`
			[
			  "tests/fixtures/cli/fixes.js:4:17: error complexity(cognitive-complexity): Function 'loopBody' at lines 4-13 has cognitive complexity 7, over the max of 0; main contributors: 'if' at line 6 (+2, nested 1 deep), 'if' at line 8 (+2, nested 1 deep), 'if' at line 10 (+2, nested 1 deep); fix: move lines 6-11 (the body of the 'for...of' at line 5) into a new function; this one drops to 1 and the new one scores 3.",
			  "tests/fixtures/cli/fixes.js:16:17: error complexity(cognitive-complexity): Function 'elseBranch' at lines 16-28 has cognitive complexity 10, over the max of 0; main contributors: 'if' at line 19 (+2, nested 1 deep), 'if' at line 21 (+2, nested 1 deep), 'if' at line 23 (+2, nested 1 deep); fix: move lines 19-26 (the 'else' branch at line 18) into a new function; this one drops to 2 and the new one scores 4.",
			  "tests/fixtures/cli/fixes.js:31:17: error complexity(cognitive-complexity): Function 'caseBody' at lines 31-45 has cognitive complexity 9, over the max of 0; main contributors: 'if' at line 34 (+2, nested 1 deep), 'if' at line 36 (+2, nested 1 deep), 'if' at line 38 (+2, nested 1 deep); fix: move lines 34-39 (the 'case' at line 33) into a new function; this one drops to 3 and the new one scores 3.",
			  "tests/fixtures/cli/fixes.js:48:17: error complexity(cognitive-complexity): Function 'catchBlock' at lines 48-61 has cognitive complexity 7, over the max of 0; main contributors: 'if' at line 52 (+2, nested 1 deep), 'if' at line 54 (+2, nested 1 deep), 'if' at line 56 (+2, nested 1 deep); fix: move lines 52-57 (the 'catch' block at line 51) into a new function; this one drops to 1 and the new one scores 3.",
			  "tests/fixtures/cli/fixes.js:64:17: error complexity(cognitive-complexity): Function 'statementRun' at lines 64-77 has cognitive complexity 6, over the max of 0; main contributors: 6 'if' at lines 65-75 (+6); fix: move lines 65-70 into a new function; this one drops to 3 and the new one scores 3.",
			  "tests/fixtures/cli/fixes.js:80:34: error complexity(cognitive-complexity): Function 'ternary' at line 80 has cognitive complexity 6, over the max of 0; main contributors: '?:' at line 80 (+3, nested 2 deep), '?:' at line 80 (+2, nested 1 deep), '?:' at line 80 (+1); fix: move the '?:' at line 80, column 43, into a helper function; this one drops to 1 and the helper scores 3.",
			  "tests/fixtures/cli/fixes.js:83:17: error complexity(cognitive-complexity): Function 'condition' at lines 83-85 has cognitive complexity 3, over the max of 0; main contributors: '&&' at line 84 (+3); fix: split the condition at line 84 into named helper functions.",
			  "tests/fixtures/cli/fixes.js:88:17: error complexity(cognitive-complexity): Function 'elseIfChain' at lines 88-94 has cognitive complexity 4, over the max of 0; main contributors: 3 'else if' at lines 90-92 (+3), 'if' at line 89 (+1); fix: replace the else-if chain at line 90 with a switch or a lookup table.",
			  "tests/fixtures/cli/fixes.js:97:17: error complexity(cognitive-complexity): Function 'single' at lines 97-101 has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 98 (+1); fix: split the code around line 98 into smaller functions.",
			  "tests/fixtures/cli/fixes.js:104:17: error complexity(cognitive-complexity): Function 'sameLine' at lines 104-106 has cognitive complexity 10, over the max of 0; main contributors: 'if' at line 105 (+4, nested 3 deep), 'if' at line 105 (+3, nested 2 deep), 'for' at line 105 (+2, nested 1 deep); fix: move line 105 (the body of the 'for' at line 105, column 11) into a new function; this one drops to 3 and the new one scores 3.",
			]
		`);
	});

	// At max 0 a guard clause is never enough on its own, so the shipped rule suggests one
	// only when no region can move. The rule that always prefers a guard shows where one
	// qualifies.
	test("suggest a guard clause only where nothing would be skipped", () => {
		const guardFirst = { config: "oxlintrc-guard-first.json", rule: "guard-first" };

		expect(agentLines("guards.js", guardFirst)).toMatchInlineSnapshot(`
			[
			  "tests/fixtures/cli/guards.js:2:17: error complexity(guard-first): Function 'returns' at lines 2-10 has cognitive complexity 6, over the max of 0; main contributors: 'if' at line 5 (+3, nested 2 deep), 'for...of' at line 4 (+2, nested 1 deep), 'if' at line 3 (+1); fix: invert the 'if' at line 3 into a guard clause that returns early, so its body moves up a level; this one drops to 4.",
			  "tests/fixtures/cli/guards.js:13:17: error complexity(guard-first): Function 'continues' at lines 13-22 has cognitive complexity 10, over the max of 0; main contributors: 'if' at line 17 (+4, nested 3 deep), 'for...of' at line 16 (+3, nested 2 deep), 'if' at line 15 (+2, nested 1 deep); fix: invert the 'if' at line 15 into a guard clause that continues to the next iteration early, so its body moves up a level; this one drops to 8.",
			  "tests/fixtures/cli/guards.js:25:17: error complexity(guard-first): Function 'outermost' at lines 25-37 has cognitive complexity 15, over the max of 0; main contributors: 'if' at line 30 (+5, nested 4 deep), 'for...of' at line 29 (+4, nested 3 deep), 'if' at line 28 (+3, nested 2 deep); fix: invert the 'if' at line 26 into a guard clause that returns early, so its body moves up a level; this one drops to 11.",
			  "tests/fixtures/cli/guards.js:40:17: error complexity(guard-first): Function 'braceless' at lines 40-42 has cognitive complexity 15, over the max of 0; main contributors: 'if' at line 41 (+5, nested 4 deep), 'for...of' at line 41 (+4, nested 3 deep), 'if' at line 41 (+3, nested 2 deep); fix: invert the 'if' at line 41, column 2 into a guard clause that returns early, so its body moves up a level; this one drops to 11.",
			  "tests/fixtures/cli/guards.js:45:17: error complexity(guard-first): Function 'trailing' at lines 45-54 has cognitive complexity 6, over the max of 0; main contributors: 'if' at line 48 (+3, nested 2 deep), 'if' at line 47 (+2, nested 1 deep), 'if' at line 46 (+1); fix: move lines 47-51 (the body of the 'if' at line 46) into a new function; this one drops to 1 and the new one scores 3.",
			  "tests/fixtures/cli/guards.js:57:17: error complexity(guard-first): Function 'inElse' at lines 57-67 has cognitive complexity 7, over the max of 0; main contributors: 'if' at line 62 (+3, nested 2 deep), 'if' at line 61 (+2, nested 1 deep), 'if' at line 58 (+1); fix: move lines 61-65 (the 'else' branch at line 60) into a new function; this one drops to 2 and the new one scores 3.",
			  "tests/fixtures/cli/guards.js:70:17: error complexity(guard-first): Function 'hasElse' at lines 70-80 has cognitive complexity 7, over the max of 0; main contributors: 'if' at line 73 (+3, nested 2 deep), 'if' at line 72 (+2, nested 1 deep), 'if' at line 71 (+1); fix: move lines 72-76 (the body of the 'if' at line 71) into a new function; this one drops to 2 and the new one scores 3.",
			  "tests/fixtures/cli/guards.js:83:17: error complexity(guard-first): Function 'inCase' at lines 83-92 has cognitive complexity 6, over the max of 0; main contributors: 'if' at line 87 (+3, nested 2 deep), 'if' at line 86 (+2, nested 1 deep), 'switch' at line 84 (+1); fix: move lines 86-90 (the 'case' at line 85) into a new function; this one drops to 1 and the new one scores 3.",
			  "tests/fixtures/cli/guards.js:95:17: error complexity(guard-first): Function 'inTry' at lines 95-105 has cognitive complexity 4, over the max of 0; main contributors: 'if' at line 98 (+2, nested 1 deep), 'if' at line 97 (+1), 'catch' at line 102 (+1); fix: move lines 98-100 (the body of the 'if' at line 97) into a new function; this one drops to 2 and the new one scores 1.",
			  "tests/fixtures/cli/guards.js:108:17: error complexity(guard-first): Function 'savesNothing' at lines 108-114 has cognitive complexity 3, over the max of 0; main contributors: 'if' at line 110 (+2, nested 1 deep), 'for...of' at line 109 (+1); fix: move lines 110-112 (the body of the 'for...of' at line 109) into a new function; this one drops to 1 and the new one scores 1.",
			  "tests/fixtures/cli/guards.js:117:17: error complexity(guard-first): Function 'flatInside' at lines 117-123 has cognitive complexity 7, over the max of 0; main contributors: 'if' at line 120 (+3, nested 2 deep), 'for...of' at line 119 (+2, nested 1 deep), 'if' at line 118 (+1); fix: invert the 'if' at line 118 into a guard clause that returns early, so its body moves up a level; this one drops to 5.",
			  "tests/fixtures/cli/guards.js:126:17: error complexity(guard-first): Function 'doWhile' at lines 126-132 has cognitive complexity 6, over the max of 0; main contributors: 'for...of' at line 129 (+3, nested 2 deep), 'if' at line 128 (+2, nested 1 deep), 'do...while' at line 127 (+1); fix: invert the 'if' at line 128 into a guard clause that continues to the next iteration early, so its body moves up a level; this one drops to 5.",
			  "tests/fixtures/cli/guards.js:135:17: error complexity(guard-first): Function 'loopTrailing' at lines 135-143 has cognitive complexity 6, over the max of 0; main contributors: 'for...of' at line 139 (+3, nested 2 deep), 'if' at line 138 (+2, nested 1 deep), 'do...while' at line 137 (+1); fix: move line 139 (the body of the 'if' at line 138) into a new function; this one drops to 3 and the new one scores 1.",
			  "tests/fixtures/cli/guards.js:146:17: error complexity(guard-first): Function 'elseIfPath' at lines 146-154 has cognitive complexity 7, over the max of 0; main contributors: 'while' at line 151 (+3, nested 2 deep), 'if' at line 150 (+2, nested 1 deep), 'if' at line 147 (+1); fix: move lines 150-152 (the body of the 'else if' at line 149) into a new function; this one drops to 2 and the new one scores 3.",
			  "tests/fixtures/cli/guards.js:157:17: error complexity(guard-first): Function 'labeled' at lines 157-165 has cognitive complexity 3, over the max of 0; main contributors: 'if' at line 160 (+2, nested 1 deep), 'if' at line 159 (+1); fix: move lines 160-162 (the body of the 'if' at line 159) into a new function; this one drops to 1 and the new one scores 1.",
			  "tests/fixtures/cli/guards.js:168:17: error complexity(guard-first): Function 'inCatch' at lines 168-176 has cognitive complexity 6, over the max of 0; main contributors: 'if' at line 173 (+3, nested 2 deep), 'if' at line 172 (+2, nested 1 deep), 'catch' at line 171 (+1); fix: move lines 172-174 (the 'catch' block at line 171) into a new function; this one drops to 1 and the new one scores 3.",
			]
		`);
	});

	test("say what stands in the way of a move, and count its workaround", () => {
		expect(agentLines("obstacles.js")).toMatchInlineSnapshot(`
			[
			  "tests/fixtures/cli/obstacles.js:5:17: error complexity(cognitive-complexity): Function 'returnsAlways' at lines 5-12 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 7 (+3, nested 2 deep), 'if' at line 8 (+3, nested 2 deep), 'for...of' at line 7 (+2, nested 1 deep); fix: move lines 7-9 (the body of the 'if' at line 6) into a new function; it returns from this function, so return its result from the caller; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:15:17: error complexity(cognitive-complexity): Function 'returnsBareAlways' at lines 15-22 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 17 (+3, nested 2 deep), 'if' at line 18 (+3, nested 2 deep), 'for...of' at line 17 (+2, nested 1 deep); fix: move lines 17-19 (the body of the 'if' at line 16) into a new function; it returns from this function, so call it and then return; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:25:17: error complexity(cognitive-complexity): Function 'returnsSome' at lines 25-35 has cognitive complexity 20, over the max of 0; main contributors: 'if' at line 28 (+4, nested 3 deep), 'if' at line 29 (+4, nested 3 deep), 'for...of' at line 28 (+3, nested 2 deep); fix: move lines 28-30 (the body of the 'if' at line 27) into a new function; it returns from this function on some paths, so have it return the result or undefined, and return that from the caller when it is defined; this one drops to 6 and the new one scores 7.",
			  "tests/fixtures/cli/obstacles.js:38:17: error complexity(cognitive-complexity): Function 'returnsBareSome' at lines 38-48 has cognitive complexity 20, over the max of 0; main contributors: 'if' at line 41 (+4, nested 3 deep), 'if' at line 42 (+4, nested 3 deep), 'for...of' at line 41 (+3, nested 2 deep); fix: move lines 41-43 (the body of the 'if' at line 40) into a new function; it returns from this function on some paths, so have it return whether to stop, and return from the caller when it does; this one drops to 6 and the new one scores 7.",
			  "tests/fixtures/cli/obstacles.js:51:17: error complexity(cognitive-complexity): Function 'returnsMixed' at lines 51-62 has cognitive complexity 23, over the max of 0; main contributors: 'if' at line 54 (+4, nested 3 deep), 'if' at line 55 (+4, nested 3 deep), 'for...of' at line 54 (+3, nested 2 deep); fix: move line 54 (the body of the 'for...of' at line 54) into a new function; this one drops to 19 and the new one scores 1.",
			  "tests/fixtures/cli/obstacles.js:65:17: error complexity(cognitive-complexity): Function 'breaks' at lines 65-75 has cognitive complexity 20, over the max of 0; main contributors: 'if' at line 68 (+4, nested 3 deep), 'if' at line 69 (+4, nested 3 deep), 'for...of' at line 68 (+3, nested 2 deep); fix: move lines 68-70 (the body of the 'if' at line 67) into a new function; it breaks out of the 'for...of' at line 66, so have it return whether to break, and break from the caller when it does; this one drops to 6 and the new one scores 7.",
			  "tests/fixtures/cli/obstacles.js:78:17: error complexity(cognitive-complexity): Function 'continues' at lines 78-88 has cognitive complexity 20, over the max of 0; main contributors: 'if' at line 81 (+4, nested 3 deep), 'if' at line 82 (+4, nested 3 deep), 'for...of' at line 81 (+3, nested 2 deep); fix: move lines 81-83 (the body of the 'if' at line 80) into a new function; it continues the 'for...of' at line 79, so have it return whether to continue, and continue from the caller when it does; this one drops to 6 and the new one scores 7.",
			  "tests/fixtures/cli/obstacles.js:91:17: error complexity(cognitive-complexity): Function 'continuesOwnLoop' at lines 91-99 has cognitive complexity 13, over the max of 0; main contributors: 'if' at line 93 (+3, nested 2 deep), 'if' at line 94 (+3, nested 2 deep), 'for...of' at line 93 (+2, nested 1 deep); fix: move lines 93-96 (the body of the 'for...of' at line 92) into a new function; this one drops to 1 and the new one scores 7.",
			  "tests/fixtures/cli/obstacles.js:102:17: error complexity(cognitive-complexity): Function 'breaksToLabel' at lines 102-112 has cognitive complexity 21, over the max of 0; main contributors: 'if' at line 105 (+4, nested 3 deep), 'if' at line 106 (+4, nested 3 deep), 'for...of' at line 105 (+3, nested 2 deep); fix: move lines 105-107 (the body of the 'if' at line 104) into a new function; it breaks to 'outer', so have it return whether to break, and break outer from the caller when it does; this one drops to 7 and the new one scores 7.",
			  "tests/fixtures/cli/obstacles.js:115:17: error complexity(cognitive-complexity): Function 'breaksAndContinues' at lines 115-126 has cognitive complexity 23, over the max of 0; main contributors: 'if' at line 118 (+4, nested 3 deep), 'if' at line 119 (+4, nested 3 deep), 'for...of' at line 118 (+3, nested 2 deep); fix: move lines 117-123 (the body of the 'for...of' at line 116) into a new function; it breaks out of the 'for...of' at line 116, so have it return whether to break, and break from the caller when it does; this one drops to 3 and the new one scores 15.",
			  "tests/fixtures/cli/obstacles.js:129:17: error complexity(cognitive-complexity): Function 'innerJumps' at lines 129-144 has cognitive complexity 14, over the max of 0; main contributors: 'if' at line 132 (+3, nested 2 deep), 'if' at line 140 (+3, nested 2 deep), 'for...of' at line 131 (+2, nested 1 deep); fix: move lines 131-141 (the body of the 'if' at line 130) into a new function; this one drops to 1 and the new one scores 8.",
			  "tests/fixtures/cli/obstacles.js:147:17: error complexity(cognitive-complexity): Function 'nestedReturn' at lines 147-157 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 149 (+3, nested 2 deep), 'if' at line 150 (+3, nested 2 deep), 'for...of' at line 149 (+2, nested 1 deep); fix: move lines 149-154 (the body of the 'if' at line 148) into a new function; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:160:23: error complexity(cognitive-complexity): Function 'awaits' at lines 160-167 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 162 (+3, nested 2 deep), 'if' at line 163 (+3, nested 2 deep), 'for...of' at line 162 (+2, nested 1 deep); fix: move lines 162-164 (the body of the 'if' at line 161) into a new function; it awaits, so make it async and await it; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:170:18: error complexity(cognitive-complexity): Function 'yields' at lines 170-177 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 172 (+3, nested 2 deep), 'if' at line 173 (+3, nested 2 deep), 'for...of' at line 172 (+2, nested 1 deep); fix: move lines 172-174 (the body of the 'if' at line 171) into a new function; it yields, so make it a generator and yield* its result; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:180:17: error complexity(cognitive-complexity): Function 'reassigns' at lines 180-188 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 183 (+3, nested 2 deep), 'if' at line 184 (+3, nested 2 deep), 'for...of' at line 183 (+2, nested 1 deep); fix: move lines 183-185 (the body of the 'if' at line 182) into a new function; it reassigns 'count', which the code around it reads, so have it return the new 'count' and assign it from the call; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:191:17: error complexity(cognitive-complexity): Function 'loopCarried' at lines 191-203 has cognitive complexity 17, over the max of 0; main contributors: 'if' at line 195 (+4, nested 3 deep), 'if' at line 196 (+4, nested 3 deep), 'for...of' at line 195 (+3, nested 2 deep); fix: move lines 195-198 (the body of the 'if' at line 194) into a new function; it reassigns 'count', which the code around it reads, so have it return the new 'count' and assign it from the call; this one drops to 3 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:206:17: error complexity(cognitive-complexity): Function 'loopCounter' at lines 206-216 has cognitive complexity 17, over the max of 0; main contributors: 'if' at line 209 (+4, nested 3 deep), 'if' at line 210 (+4, nested 3 deep), 'for...of' at line 209 (+3, nested 2 deep); fix: move lines 209-211 (the body of the 'if' at line 208) into a new function; it reassigns 'i', which the code around it reads, so have it return the new 'i' and assign it from the call; this one drops to 3 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:219:17: error complexity(cognitive-complexity): Function 'readBefore' at lines 219-228 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 223 (+3, nested 2 deep), 'if' at line 224 (+3, nested 2 deep), 'for...of' at line 223 (+2, nested 1 deep); fix: move lines 223-225 (the body of the 'if' at line 222) into a new function; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:231:17: error complexity(cognitive-complexity): Function 'closureReads' at lines 231-240 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 235 (+3, nested 2 deep), 'if' at line 236 (+3, nested 2 deep), 'for...of' at line 235 (+2, nested 1 deep); fix: move lines 235-237 (the body of the 'if' at line 234) into a new function; it reassigns 'count', which the code around it reads, so have it return the new 'count' and assign it from the call; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:243:17: error complexity(cognitive-complexity): Function 'closureWrites' at lines 243-251 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 246 (+3, nested 2 deep), 'if' at line 247 (+3, nested 2 deep), 'for...of' at line 246 (+2, nested 1 deep); fix: move line 246 (the body of the 'for...of' at line 246) into a new function; this one drops to 8 and the new one scores 1.",
			  "tests/fixtures/cli/obstacles.js:254:17: error complexity(cognitive-complexity): Function 'declaresVar' at lines 254-261 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 256 (+3, nested 2 deep), 'if' at line 257 (+3, nested 2 deep), 'for...of' at line 256 (+2, nested 1 deep); fix: move lines 256-258 (the body of the 'if' at line 255) into a new function; it declares 'found', which the code after it uses, so declare 'found' before line 255, have it return 'found', and assign it from the call; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:264:17: error complexity(cognitive-complexity): Function 'declaresInCase' at lines 264-275 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 267 (+3, nested 2 deep), 'if' at line 268 (+3, nested 2 deep), 'for...of' at line 267 (+2, nested 1 deep); fix: move lines 267-269 (the 'case' at line 266) into a new function; it declares 'label', which the code after it uses, so declare 'label' before line 265, have it return 'label', and assign it from the call; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:278:17: error complexity(cognitive-complexity): Function 'hoisted' at lines 278-286 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 281 (+3, nested 2 deep), 'if' at line 282 (+3, nested 2 deep), 'for...of' at line 281 (+2, nested 1 deep); fix: move line 281 (the body of the 'for...of' at line 281) into a new function; this one drops to 8 and the new one scores 1.",
			  "tests/fixtures/cli/obstacles.js:289:17: error complexity(cognitive-complexity): Function 'returnsAndReassigns' at lines 289-301 has cognitive complexity 20, over the max of 0; main contributors: 'if' at line 293 (+4, nested 3 deep), 'if' at line 294 (+4, nested 3 deep), 'for...of' at line 293 (+3, nested 2 deep); fix: move line 293 (the body of the 'for...of' at line 293) into a new function; this one drops to 16 and the new one scores 1.",
			  "tests/fixtures/cli/obstacles.js:304:17: error complexity(cognitive-complexity): Function 'ternaryAssigns' at lines 304-311 has cognitive complexity 5, over the max of 0; main contributors: 'if' at line 307 (+2, nested 1 deep), '?:' at line 308 (+2, nested 1 deep), 'if' at line 306 (+1); fix: split the code around line 307 into smaller functions.",
			  "tests/fixtures/cli/obstacles.js:314:17: error complexity(cognitive-complexity): Function 'writesThenReturns' at lines 314-323 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 317 (+3, nested 2 deep), 'if' at line 318 (+3, nested 2 deep), 'for...of' at line 317 (+2, nested 1 deep); fix: move lines 317-320 (the body of the 'if' at line 316) into a new function; it returns from this function, so return its result from the caller; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:326:17: error complexity(cognitive-complexity): Function 'usingInRun' at lines 326-330 has cognitive complexity 5, over the max of 0; main contributors: '?:' at line 327 (+2, nested 1 deep), 2 'if' at lines 328-329 (+2), '?:' at line 327 (+1); fix: move the '?:' at line 327, column 28, into a helper function; this one drops to 3 and the helper scores 1.",
			  "tests/fixtures/cli/obstacles.js:334:17: error complexity(cognitive-complexity): Function 'sync' at lines 334-346 has cognitive complexity 19, over the max of 0; main contributors: 'if' at line 339 (+5, nested 4 deep), 'if' at line 338 (+4, nested 3 deep), 'if' at line 341 (+4, nested 3 deep); fix: move lines 337-342 (the body of the 'if' at line 336) into a new function; it returns from this function on some paths, so have it return the result or undefined, and return that from the caller when it is defined; this one drops to 6 and the new one scores 8.",
			  "tests/fixtures/cli/obstacles.js:349:17: error complexity(cognitive-complexity): Function 'breaksOwnLoop' at lines 349-357 has cognitive complexity 13, over the max of 0; main contributors: 'if' at line 351 (+3, nested 2 deep), 'if' at line 352 (+3, nested 2 deep), 'for...of' at line 351 (+2, nested 1 deep); fix: move lines 351-354 (the body of the 'for...of' at line 350) into a new function; it breaks out of the 'for...of' at line 350, so have it return whether to break, and break from the caller when it does; this one drops to 3 and the new one scores 7.",
			  "tests/fixtures/cli/obstacles.js:360:17: error complexity(cognitive-complexity): Function 'breaksOwnSwitch' at lines 360-372 has cognitive complexity 13, over the max of 0; main contributors: 'if' at line 363 (+3, nested 2 deep), 'if' at line 364 (+3, nested 2 deep), 'for...of' at line 363 (+2, nested 1 deep); fix: move lines 363-366 (the 'case' at line 362) into a new function; this one drops to 1 and the new one scores 7.",
			  "tests/fixtures/cli/obstacles.js:376:17: error complexity(cognitive-complexity): Function 'breaksThenReturns' at lines 376-387 has cognitive complexity 20, over the max of 0; main contributors: 'if' at line 379 (+4, nested 3 deep), 'if' at line 380 (+4, nested 3 deep), 'for...of' at line 379 (+3, nested 2 deep); fix: move line 379 (the body of the 'for...of' at line 379) into a new function; this one drops to 16 and the new one scores 1.",
			  "tests/fixtures/cli/obstacles.js:390:17: error complexity(cognitive-complexity): Function 'switchFallsOut' at lines 390-403 has cognitive complexity 16, over the max of 0; main contributors: 'if' at line 392 (+3, nested 2 deep), 'if' at line 393 (+3, nested 2 deep), 'if' at line 396 (+3, nested 2 deep); fix: move lines 392-400 (the body of the 'if' at line 391) into a new function; it returns from this function on some paths, so have it return the result or undefined, and return that from the caller when it is defined; this one drops to 3 and the new one scores 9.",
			  "tests/fixtures/cli/obstacles.js:408:19: error complexity(cognitive-complexity): Function 'add' at lines 408-415 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 410 (+3, nested 2 deep), 'if' at line 411 (+3, nested 2 deep), 'for...of' at line 410 (+2, nested 1 deep); fix: move lines 410-412 (the body of the 'if' at line 409) into a new function; it reassigns 'total', which the code around it reads, so have it return the new 'total' and assign it from the call; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:420:17: error complexity(cognitive-complexity): Function 'redeclared' at lines 420-428 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 423 (+3, nested 2 deep), 'if' at line 424 (+3, nested 2 deep), 'for...of' at line 423 (+2, nested 1 deep); fix: move lines 423-425 (the body of the 'if' at line 422) into a new function; it reassigns 'found', which the code around it reads, so have it return the new 'found' and assign it from the call; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:432:17: error complexity(cognitive-complexity): Function 'runAtNextScore' at lines 432-436 has cognitive complexity 4, over the max of 0; main contributors: 3 'if' at lines 433-435 (+3), '&&' at line 434 (+1); fix: move line 433 into a new function; this one drops to 3 and the new one scores 1.",
			  "tests/fixtures/cli/obstacles.js:439:17: error complexity(cognitive-complexity): Function 'innerVariables' at lines 439-450 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 441 (+3, nested 2 deep), 'if' at line 442 (+3, nested 2 deep), 'for...of' at line 441 (+2, nested 1 deep); fix: move lines 441-447 (the body of the 'if' at line 440) into a new function; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:453:17: error complexity(cognitive-complexity): Function 'labelOptional' at lines 453-464 has cognitive complexity 24, over the max of 0; main contributors: 'if' at line 456 (+4, nested 3 deep), 'if' at line 457 (+4, nested 3 deep), 'for...of' at line 456 (+3, nested 2 deep); fix: move lines 456-459 (the body of the 'if' at line 455) into a new function; it breaks out of the 'for...of' at line 454, so have it return whether to break, and break from the caller when it does; this one drops to 6 and the new one scores 8.",
			  "tests/fixtures/cli/obstacles.js:467:17: error complexity(cognitive-complexity): Function 'continuesThenReturns' at lines 467-475 has cognitive complexity 13, over the max of 0; main contributors: 'if' at line 470 (+3, nested 2 deep), 'if' at line 471 (+3, nested 2 deep), 'if' at line 469 (+2, nested 1 deep); fix: move lines 469-472 (the body of the 'for...of' at line 468) into a new function; it returns from this function on some paths, so have it return the result or undefined, and return that from the caller when it is defined; this one drops to 3 and the new one scores 7.",
			  "tests/fixtures/cli/obstacles.js:478:17: error complexity(cognitive-complexity): Function 'closureOwnVar' at lines 478-489 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 480 (+3, nested 2 deep), 'if' at line 481 (+3, nested 2 deep), 'for...of' at line 480 (+2, nested 1 deep); fix: move lines 480-486 (the body of the 'if' at line 479) into a new function; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:492:17: error complexity(cognitive-complexity): Function 'returnsReadByClosure' at lines 492-502 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 496 (+3, nested 2 deep), 'if' at line 497 (+3, nested 2 deep), 'for...of' at line 496 (+2, nested 1 deep); fix: move lines 496-499 (the body of the 'if' at line 495) into a new function; it reassigns 'value', which the code around it reads, so have it return the new 'value' and assign it from the call, and it returns from this function, so call it and then return; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:505:17: error complexity(cognitive-complexity): Function 'continuesToLabel' at lines 505-517 has cognitive complexity 29, over the max of 0; main contributors: 'if' at line 509 (+5, nested 4 deep), 'if' at line 510 (+5, nested 4 deep), 'for...of' at line 509 (+4, nested 3 deep); fix: move lines 509-511 (the body of the 'if' at line 508) into a new function; it continues 'outer', so have it return whether to continue, and continue outer from the caller when it does; this one drops to 11 and the new one scores 7.",
			  "tests/fixtures/cli/obstacles.js:520:17: error complexity(cognitive-complexity): Function 'reassignsAndDeclares' at lines 520-529 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 523 (+3, nested 2 deep), 'if' at line 524 (+3, nested 2 deep), 'for...of' at line 523 (+2, nested 1 deep); fix: move lines 523-526 (the body of the 'if' at line 522) into a new function; it reassigns 'count' and declares 'found', which the code around it reads, so declare 'found' before line 522, have it return the new 'count' and 'found', and assign them from the call; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/obstacles.js:532:17: error complexity(cognitive-complexity): Function 'reassignsTwo' at lines 532-542 has cognitive complexity 11, over the max of 0; main contributors: 'if' at line 536 (+3, nested 2 deep), 'if' at line 537 (+3, nested 2 deep), 'for...of' at line 536 (+2, nested 1 deep); fix: move lines 536-539 (the body of the 'if' at line 535) into a new function; it reassigns 'count' and 'last', which the code around it reads, so have it return the new 'count' and 'last' and assign them from the call; this one drops to 1 and the new one scores 6.",
			]
		`);
	});

	test("give lines in the file, not the script block, for .vue, .svelte and .astro", () => {
		const files = ["component.vue", "inline.vue", "widget.svelte", "page.astro"];

		expect(files.flatMap((file) => agentLines(`embedded/${file}`))).toMatchInlineSnapshot(`
			[
			  "tests/fixtures/cli/embedded/component.vue:8:10: error complexity(cognitive-complexity): Function 'plain' at lines 8-17 has cognitive complexity 15, over the max of 0; main contributors: 3 'if' at lines 9-11 (+3), 'if' at line 13 (+3, nested 2 deep), 'if' at line 14 (+3, nested 2 deep); fix: move lines 13-14 (the body of the 'for...of' at line 12) into a new function; this one drops to 5 and the new one scores 6.",
			  "tests/fixtures/cli/embedded/component.vue:21:10: error complexity(cognitive-complexity): Function 'setup' at lines 21-30 has cognitive complexity 15, over the max of 0; main contributors: 3 'if' at lines 22-24 (+3), 'if' at line 26 (+3, nested 2 deep), 'if' at line 27 (+3, nested 2 deep); fix: move lines 26-27 (the body of the 'for...of' at line 25) into a new function; this one drops to 5 and the new one scores 6.",
			  "tests/fixtures/cli/embedded/inline.vue:2:18: error complexity(cognitive-complexity): Function 'sameLine' at line 2 has cognitive complexity 11, over the max of 0; main contributors: 2 'if' at line 2 (+6, nested 2 deep), 2 'for...of' at line 2 (+4, nested 1 deep), 'if' at line 2 (+1); fix: move line 2 (the body of the 'if' at line 2, column 33) into a new function; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/embedded/inline.vue:3:10: error complexity(cognitive-complexity): Function 'nextLine' at line 3 has cognitive complexity 11, over the max of 0; main contributors: 2 'if' at line 3 (+6, nested 2 deep), 2 'for...of' at line 3 (+4, nested 1 deep), 'if' at line 3 (+1); fix: move line 3 (the body of the 'if' at line 3, column 25) into a new function; this one drops to 1 and the new one scores 6.",
			  "tests/fixtures/cli/embedded/widget.svelte:6:10: error complexity(cognitive-complexity): Function 'instance' at lines 6-15 has cognitive complexity 15, over the max of 0; main contributors: 3 'if' at lines 7-9 (+3), 'if' at line 11 (+3, nested 2 deep), 'if' at line 12 (+3, nested 2 deep); fix: move lines 11-12 (the body of the 'for...of' at line 10) into a new function; this one drops to 5 and the new one scores 6.",
			  "tests/fixtures/cli/embedded/page.astro:2:10: error complexity(cognitive-complexity): Function 'frontmatter' at lines 2-11 has cognitive complexity 15, over the max of 0; main contributors: 3 'if' at lines 3-5 (+3), 'if' at line 7 (+3, nested 2 deep), 'if' at line 8 (+3, nested 2 deep); fix: move lines 7-8 (the body of the 'for...of' at line 6) into a new function; this one drops to 5 and the new one scores 6.",
			  "tests/fixtures/cli/embedded/page.astro:17:10: error complexity(cognitive-complexity): Function 'client' at lines 17-26 has cognitive complexity 15, over the max of 0; main contributors: 3 'if' at lines 18-20 (+3), 'if' at line 22 (+3, nested 2 deep), 'if' at line 23 (+3, nested 2 deep); fix: move lines 22-23 (the body of the 'for...of' at line 21) into a new function; this one drops to 5 and the new one scores 6.",
			]
		`);
	});

	test("are one line each, with no newline inside a message", () => {
		const { diagnostics } = JSON.parse(lint("labels.ts", "json").stdout) as {
			diagnostics: { message: string }[];
		};

		expect(diagnostics.length).toBeGreaterThan(0);

		for (const { message } of diagnostics) {
			expect(message).not.toMatch(/[\n\r]/);
		}

		expect(agentLines("labels.ts")).toHaveLength(diagnostics.length);
	});
});

describe("the Oxlint CLI", () => {
	test("prints the default format with the message and a code frame", () => {
		const { stdout } = lint("format.js", "default");
		// Timing and thread counts vary from run to run.
		const stable = stdout.replace(/^Finished in .*$/m, "Finished in …");

		expect(stable).toMatchInlineSnapshot(`
			"
			  x complexity(cognitive-complexity): Function 'format' at lines 2-6 has cognitive complexity 3, over the max of 0; main contributors: 'if' at line 4 (+2, nested 1 deep), 'for...of' at line 3 (+1); fix: move line 4 (the body of the 'for...of' at line 3) into a new function; this one drops to 1 and the new one scores 1.
			   ,-[tests/fixtures/cli/format.js:2:17]
			 1 | // One diagnostic, to pin the default format.
			 2 | export function format(rows) {
			   :                 ^^^^^^
			 3 |     for (const row of rows) {
			   \`----

			Found 0 warnings and 1 error.
			Finished in …
			"
		`);
	});

	test("exits with 1 when a function is over the max, reported as an error, and 0 when none is", () => {
		expect(lint("format.js", "default").status).toBe(1);

		expect(lint("format.js", "agent").status).toBe(1);

		expect(lint("clean.js", "default").status).toBe(0);

		expect(lint("clean.js", "agent").status).toBe(0);
	});
});

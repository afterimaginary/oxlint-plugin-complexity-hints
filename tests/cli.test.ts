import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "..");
const oxlint = join(root, "node_modules/.bin/oxlint");

/** Runs the Oxlint CLI from the repository root over a file in tests/fixtures/cli/, at max 0. */
function lint(file: string, format: string): string {
	const result = spawnSync(
		oxlint,
		["-c", "tests/fixtures/cli/oxlintrc.json", "--format", format, `tests/fixtures/cli/${file}`],
		{ cwd: root, encoding: "utf8", timeout: 30_000 },
	);

	if (result.error) {
		throw result.error;
	}

	return result.stdout;
}

/** Agent-format diagnostics in line order; Oxlint's own order isn't stable. */
function agentLines(file: string): string[] {
	const line = (diagnostic: string) => Number(diagnostic.split(":")[1]);

	return lint(file, "agent")
		.split("\n")
		.filter((diagnostic) => diagnostic.includes("complexity(cognitive-complexity)"))
		.sort((a, b) => line(a) - line(b));
}

describe("diagnostics in --format agent", () => {
	test("name each kind of function", () => {
		expect(agentLines("labels.ts")).toMatchInlineSnapshot(`
			[
			  "tests/fixtures/cli/labels.ts:3:17: error complexity(cognitive-complexity): Function 'declared' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 4 (+1); fix: split the code around line 4 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:8:35: error complexity(cognitive-complexity): Function 'bound' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 9 (+1); fix: split the code around line 9 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:15:19: error complexity(cognitive-complexity): Function 'target.nested.f' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 16 (+1); fix: split the code around line 16 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:23:20: error complexity(cognitive-complexity): Function 'target.nested.f' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 24 (+1); fix: split the code around line 24 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:29:25: error complexity(cognitive-complexity): Method '#hidden' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 30 (+1); fix: split the code around line 30 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:34:23: error complexity(cognitive-complexity): Method 'field' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 35 (+1); fix: split the code around line 35 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:39:2: error complexity(cognitive-complexity): Method 'constructor' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 40 (+1); fix: split the code around line 40 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:44:2: error complexity(cognitive-complexity): Method 'method' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 45 (+1); fix: split the code around line 45 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:49:6: error complexity(cognitive-complexity): Method 'size' has cognitive complexity 1, over the max of 0; main contributors: '?:' at line 50 (+1); fix: split the code around line 50 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:53:3: error complexity(cognitive-complexity): Method '[computed]' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 54 (+1); fix: split the code around line 54 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:60:2: error complexity(cognitive-complexity): Method 'method' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 61 (+1); fix: split the code around line 61 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:64:25: error complexity(cognitive-complexity): Function 'property' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 65 (+1); fix: split the code around line 65 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:68:2: error complexity(cognitive-complexity): Method 'quoted key' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 69 (+1); fix: split the code around line 69 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:74:16: error complexity(cognitive-complexity): Default export function has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 75 (+1); fix: split the code around line 75 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:79:15: error complexity(cognitive-complexity): Immediately invoked function has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 80 (+1); fix: split the code around line 80 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:84:16: error complexity(cognitive-complexity): Callback passed to 'map' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 85 (+1); fix: split the code around line 85 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:89:23: error complexity(cognitive-complexity): Callback passed to 'Promise' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 90 (+1); fix: split the code around line 90 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:95:15: error complexity(cognitive-complexity): Anonymous function has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 96 (+1); fix: split the code around line 96 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:99:2: error complexity(cognitive-complexity): Function 'named' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 100 (+1); fix: split the code around line 100 into smaller functions.",
			  "tests/fixtures/cli/labels.ts:105:27: error complexity(cognitive-complexity): Callback has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 106 (+1); fix: split the code around line 106 into smaller functions.",
			]
		`);
	});

	test("group and rank the main contributors", () => {
		expect(agentLines("contributors.js")).toMatchInlineSnapshot(`
			[
			  "tests/fixtures/cli/contributors.js:4:17: error complexity(cognitive-complexity): Function 'flat' has cognitive complexity 4, over the max of 0; main contributors: 4 'if' at lines 5-11 (+4); fix: move lines 5-8 into a new function; this one drops to 2 and the new one scores 2.",
			  "tests/fixtures/cli/contributors.js:16:17: error complexity(cognitive-complexity): Function 'deep' has cognitive complexity 10, over the max of 0; main contributors: 'if' at line 20 (+4, nested 3 deep), 'while' at line 19 (+3, nested 2 deep), 'for...of' at line 18 (+2, nested 1 deep); fix: invert the 'if' at line 17 into a guard clause that returns early, so its body moves up a level; this one drops to 7.",
			  "tests/fixtures/cli/contributors.js:28:17: error complexity(cognitive-complexity): Function 'mixed' has cognitive complexity 10, over the max of 0; main contributors: 2 '?:' at line 30 (+4, nested 1 deep), 'for' at line 31 (+2, nested 1 deep), 'if' at line 29 (+1); fix: move lines 30-33 (the body of the 'if' at line 29) into a new function; this one drops to 4 and the new one scores 3.",
			  "tests/fixtures/cli/contributors.js:41:17: error complexity(cognitive-complexity): Function 'chains' has cognitive complexity 4, over the max of 0; main contributors: 3 '&&' at lines 42-44 (+4); fix: move line 43 into a new function; this one drops to 2 and the new one scores 2.",
			  "tests/fixtures/cli/contributors.js:48:23: error complexity(cognitive-complexity): Function 'jumps' has cognitive complexity 8, over the max of 0; main contributors: 'if' at line 51 (+3, nested 2 deep), 'for...in' at line 50 (+2, nested 1 deep), 2 labeled 'continue' at lines 52-54 (+2); fix: move lines 51-54 (the body of the 'for...in' at line 50) into a new function; this one drops to 3 and the new one scores 3.",
			  "tests/fixtures/cli/contributors.js:59:23: error complexity(cognitive-complexity): Function 'awaitLoop' has cognitive complexity 1, over the max of 0; main contributors: 'for await...of' at line 60 (+1); fix: split the code around line 60 into smaller functions.",
			  "tests/fixtures/cli/contributors.js:65:17: error complexity(cognitive-complexity): Function 'ties' has cognitive complexity 6, over the max of 0; main contributors: 2 'else if' at lines 67-68 (+2), 'if' at line 71 (+2, nested 1 deep), 'if' at line 66 (+1); fix: move lines 66-69 into a new function; this one drops to 3 and the new one scores 3.",
			]
		`);
	});

	test("suggest one change", () => {
		expect(agentLines("fixes.js")).toMatchInlineSnapshot(`
			[
			  "tests/fixtures/cli/fixes.js:4:17: error complexity(cognitive-complexity): Function 'loopBody' has cognitive complexity 7, over the max of 0; main contributors: 'if' at line 6 (+2, nested 1 deep), 'if' at line 8 (+2, nested 1 deep), 'if' at line 10 (+2, nested 1 deep); fix: move lines 6-11 (the body of the 'for...of' at line 5) into a new function; this one drops to 1 and the new one scores 3.",
			  "tests/fixtures/cli/fixes.js:16:17: error complexity(cognitive-complexity): Function 'elseBranch' has cognitive complexity 10, over the max of 0; main contributors: 'if' at line 19 (+2, nested 1 deep), 'if' at line 21 (+2, nested 1 deep), 'if' at line 23 (+2, nested 1 deep); fix: move lines 19-26 (the 'else' branch at line 18) into a new function; this one drops to 2 and the new one scores 4.",
			  "tests/fixtures/cli/fixes.js:31:17: error complexity(cognitive-complexity): Function 'caseBody' has cognitive complexity 9, over the max of 0; main contributors: 'if' at line 34 (+2, nested 1 deep), 'if' at line 36 (+2, nested 1 deep), 'if' at line 38 (+2, nested 1 deep); fix: move lines 34-39 (the 'case' at line 33) into a new function; this one drops to 3 and the new one scores 3.",
			  "tests/fixtures/cli/fixes.js:48:17: error complexity(cognitive-complexity): Function 'catchBlock' has cognitive complexity 7, over the max of 0; main contributors: 'if' at line 52 (+2, nested 1 deep), 'if' at line 54 (+2, nested 1 deep), 'if' at line 56 (+2, nested 1 deep); fix: move lines 52-57 (the 'catch' block at line 51) into a new function; this one drops to 1 and the new one scores 3.",
			  "tests/fixtures/cli/fixes.js:64:17: error complexity(cognitive-complexity): Function 'statementRun' has cognitive complexity 6, over the max of 0; main contributors: 6 'if' at lines 65-75 (+6); fix: move lines 65-70 into a new function; this one drops to 3 and the new one scores 3.",
			  "tests/fixtures/cli/fixes.js:80:34: error complexity(cognitive-complexity): Function 'ternary' has cognitive complexity 6, over the max of 0; main contributors: '?:' at line 80 (+3, nested 2 deep), '?:' at line 80 (+2, nested 1 deep), '?:' at line 80 (+1); fix: move the '?:' at line 80, column 43, into a helper function; this one drops to 1 and the helper scores 3.",
			  "tests/fixtures/cli/fixes.js:83:17: error complexity(cognitive-complexity): Function 'condition' has cognitive complexity 3, over the max of 0; main contributors: '&&' at line 84 (+3); fix: split the condition at line 84 into named helper functions.",
			  "tests/fixtures/cli/fixes.js:88:17: error complexity(cognitive-complexity): Function 'elseIfChain' has cognitive complexity 4, over the max of 0; main contributors: 3 'else if' at lines 90-92 (+3), 'if' at line 89 (+1); fix: replace the else-if chain at line 90 with a switch or a lookup table.",
			  "tests/fixtures/cli/fixes.js:97:17: error complexity(cognitive-complexity): Function 'single' has cognitive complexity 1, over the max of 0; main contributors: 'if' at line 98 (+1); fix: split the code around line 98 into smaller functions.",
			  "tests/fixtures/cli/fixes.js:104:17: error complexity(cognitive-complexity): Function 'sameLine' has cognitive complexity 10, over the max of 0; main contributors: 'if' at line 105 (+4, nested 3 deep), 'if' at line 105 (+3, nested 2 deep), 'for' at line 105 (+2, nested 1 deep); fix: move line 105 (the body of the 'for' at line 105, column 11) into a new function; this one drops to 3 and the new one scores 3.",
			]
		`);
	});

	test("suggest a guard clause only where nothing would be skipped", () => {
		expect(agentLines("guards.js")).toMatchInlineSnapshot(`
			[
			  "tests/fixtures/cli/guards.js:2:17: error complexity(cognitive-complexity): Function 'returns' has cognitive complexity 6, over the max of 0; main contributors: 'if' at line 5 (+3, nested 2 deep), 'for...of' at line 4 (+2, nested 1 deep), 'if' at line 3 (+1); fix: invert the 'if' at line 3 into a guard clause that returns early, so its body moves up a level; this one drops to 4.",
			  "tests/fixtures/cli/guards.js:13:17: error complexity(cognitive-complexity): Function 'continues' has cognitive complexity 10, over the max of 0; main contributors: 'if' at line 17 (+4, nested 3 deep), 'for...of' at line 16 (+3, nested 2 deep), 'if' at line 15 (+2, nested 1 deep); fix: invert the 'if' at line 15 into a guard clause that continues to the next iteration early, so its body moves up a level; this one drops to 8.",
			  "tests/fixtures/cli/guards.js:25:17: error complexity(cognitive-complexity): Function 'outermost' has cognitive complexity 15, over the max of 0; main contributors: 'if' at line 30 (+5, nested 4 deep), 'for...of' at line 29 (+4, nested 3 deep), 'if' at line 28 (+3, nested 2 deep); fix: invert the 'if' at line 26 into a guard clause that returns early, so its body moves up a level; this one drops to 11.",
			  "tests/fixtures/cli/guards.js:40:17: error complexity(cognitive-complexity): Function 'braceless' has cognitive complexity 15, over the max of 0; main contributors: 'if' at line 41 (+5, nested 4 deep), 'for...of' at line 41 (+4, nested 3 deep), 'if' at line 41 (+3, nested 2 deep); fix: invert the 'if' at line 41, column 2 into a guard clause that returns early, so its body moves up a level; this one drops to 11.",
			  "tests/fixtures/cli/guards.js:45:17: error complexity(cognitive-complexity): Function 'trailing' has cognitive complexity 6, over the max of 0; main contributors: 'if' at line 48 (+3, nested 2 deep), 'if' at line 47 (+2, nested 1 deep), 'if' at line 46 (+1); fix: move lines 47-51 (the body of the 'if' at line 46) into a new function; this one drops to 1 and the new one scores 3.",
			  "tests/fixtures/cli/guards.js:57:17: error complexity(cognitive-complexity): Function 'inElse' has cognitive complexity 7, over the max of 0; main contributors: 'if' at line 62 (+3, nested 2 deep), 'if' at line 61 (+2, nested 1 deep), 'if' at line 58 (+1); fix: move lines 61-65 (the 'else' branch at line 60) into a new function; this one drops to 2 and the new one scores 3.",
			  "tests/fixtures/cli/guards.js:70:17: error complexity(cognitive-complexity): Function 'hasElse' has cognitive complexity 7, over the max of 0; main contributors: 'if' at line 73 (+3, nested 2 deep), 'if' at line 72 (+2, nested 1 deep), 'if' at line 71 (+1); fix: move lines 72-76 (the body of the 'if' at line 71) into a new function; this one drops to 2 and the new one scores 3.",
			  "tests/fixtures/cli/guards.js:83:17: error complexity(cognitive-complexity): Function 'inCase' has cognitive complexity 6, over the max of 0; main contributors: 'if' at line 87 (+3, nested 2 deep), 'if' at line 86 (+2, nested 1 deep), 'switch' at line 84 (+1); fix: move lines 86-90 (the 'case' at line 85) into a new function; this one drops to 1 and the new one scores 3.",
			  "tests/fixtures/cli/guards.js:95:17: error complexity(cognitive-complexity): Function 'inTry' has cognitive complexity 4, over the max of 0; main contributors: 'if' at line 98 (+2, nested 1 deep), 'if' at line 97 (+1), 'catch' at line 102 (+1); fix: move lines 98-100 (the body of the 'if' at line 97) into a new function; this one drops to 2 and the new one scores 1.",
			  "tests/fixtures/cli/guards.js:108:17: error complexity(cognitive-complexity): Function 'savesNothing' has cognitive complexity 3, over the max of 0; main contributors: 'if' at line 110 (+2, nested 1 deep), 'for...of' at line 109 (+1); fix: move lines 110-112 (the body of the 'for...of' at line 109) into a new function; this one drops to 1 and the new one scores 1.",
			  "tests/fixtures/cli/guards.js:117:17: error complexity(cognitive-complexity): Function 'flatInside' has cognitive complexity 7, over the max of 0; main contributors: 'if' at line 120 (+3, nested 2 deep), 'for...of' at line 119 (+2, nested 1 deep), 'if' at line 118 (+1); fix: invert the 'if' at line 118 into a guard clause that returns early, so its body moves up a level; this one drops to 5.",
			  "tests/fixtures/cli/guards.js:126:17: error complexity(cognitive-complexity): Function 'doWhile' has cognitive complexity 6, over the max of 0; main contributors: 'for...of' at line 129 (+3, nested 2 deep), 'if' at line 128 (+2, nested 1 deep), 'do...while' at line 127 (+1); fix: invert the 'if' at line 128 into a guard clause that continues to the next iteration early, so its body moves up a level; this one drops to 5.",
			  "tests/fixtures/cli/guards.js:135:17: error complexity(cognitive-complexity): Function 'loopTrailing' has cognitive complexity 6, over the max of 0; main contributors: 'for...of' at line 139 (+3, nested 2 deep), 'if' at line 138 (+2, nested 1 deep), 'do...while' at line 137 (+1); fix: move lines 138-141 (the body of the 'do...while' at line 137) into a new function; this one drops to 1 and the new one scores 3.",
			  "tests/fixtures/cli/guards.js:146:17: error complexity(cognitive-complexity): Function 'elseIfPath' has cognitive complexity 7, over the max of 0; main contributors: 'while' at line 151 (+3, nested 2 deep), 'if' at line 150 (+2, nested 1 deep), 'if' at line 147 (+1); fix: move lines 150-152 (the body of the 'else if' at line 149) into a new function; this one drops to 2 and the new one scores 3.",
			  "tests/fixtures/cli/guards.js:157:17: error complexity(cognitive-complexity): Function 'labeled' has cognitive complexity 3, over the max of 0; main contributors: 'if' at line 160 (+2, nested 1 deep), 'if' at line 159 (+1); fix: move lines 160-162 (the body of the 'if' at line 159) into a new function; this one drops to 1 and the new one scores 1.",
			  "tests/fixtures/cli/guards.js:168:17: error complexity(cognitive-complexity): Function 'inCatch' has cognitive complexity 6, over the max of 0; main contributors: 'if' at line 173 (+3, nested 2 deep), 'if' at line 172 (+2, nested 1 deep), 'catch' at line 171 (+1); fix: move lines 172-174 (the 'catch' block at line 171) into a new function; this one drops to 1 and the new one scores 3.",
			]
		`);
	});

	test("are one line each, with no newline inside a message", () => {
		const { diagnostics } = JSON.parse(lint("labels.ts", "json")) as {
			diagnostics: { message: string }[];
		};

		expect(diagnostics.length).toBeGreaterThan(0);

		for (const { message } of diagnostics) {
			expect(message).not.toMatch(/[\n\r]/);
		}

		expect(agentLines("labels.ts")).toHaveLength(diagnostics.length);
	});
});

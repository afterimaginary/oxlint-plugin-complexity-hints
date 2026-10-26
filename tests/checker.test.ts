import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, test } from "vite-plus/test";
import { parseMessage } from "../src/checker/scope.ts";

const root = join(import.meta.dirname, "..");
const cli = join(root, "src/checker/cli.ts");
const oxlint = join(root, "node_modules/.bin/oxlint");

// Git without the user's own config, which could sign commits or change diff output; and
// `VP_VERSION` as `vp run` sets it, which a plain `oxlint` must not see.
const env = {
	...process.env,
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
	VP_VERSION: "0.0.0",
};

const made: string[] = [];

afterEach(() => {
	for (const dir of made.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

// `busy` scores 6, over the max of 3; its fix moves lines 5-9. `calm` scores 0.
const BUSY = `export function busy(xs, flag) {
	const seen = [];

	for (const x of xs) {
		if (flag) {
			if (x) {
				seen.push(x);
			}
		}
	}

	return seen;
}

export function calm(x) {
	return x;
}
`;

function run(cwd: string, args: string[] = [], withOxlint = true) {
	const result = spawnSync(
		process.execPath,
		[cli, ...(withOxlint ? ["--oxlint", oxlint] : []), ...args],
		{
			cwd,
			encoding: "utf8",
			env,
			timeout: 60_000,
		},
	);

	const lines = result.stdout.split("\n").filter(Boolean);

	return {
		status: result.status,
		stderr: result.stderr,
		errors: lines.filter((line) => line.includes(": error ")),
		notes: lines.filter((line) => line.includes(": note ")),
	};
}

/**
 * A repository with `files` committed on `main`, checked out on a branch `work`, with the
 * plugin from source at max 3 and `max-params` at 2.
 */
function repository(files: Record<string, string>, rules: Record<string, unknown> = {}) {
	const dir = mkdtempSync(join(tmpdir(), "complexity-checker-"));

	made.push(dir);

	const git = (...args: string[]) => {
		const result = spawnSync("git", args, { cwd: dir, encoding: "utf8", env });

		if (result.status !== 0) {
			throw new Error(result.stderr);
		}
	};

	const write = (path: string, text: string) => {
		mkdirSync(dirname(join(dir, path)), { recursive: true });

		writeFileSync(join(dir, path), text);
	};

	const edit = (path: string, from: string, to: string) =>
		write(path, readFileSync(join(dir, path), "utf8").replace(from, to));

	git("init", "-q", "-b", "main");

	git("config", "user.email", "test@example.com");

	git("config", "user.name", "test");

	write(
		".oxlintrc.json",
		JSON.stringify({
			jsPlugins: [{ name: "complexity", specifier: join(root, "src/index.ts") }],
			categories: { correctness: "off" },
			rules: {
				"complexity/cognitive-complexity": ["error", 3],
				"max-params": ["error", 2],
				...rules,
			},
		}),
	);

	for (const [path, text] of Object.entries(files)) {
		write(path, text);
	}

	git("add", "-A");

	git("commit", "-qm", "base");

	git("checkout", "-qb", "work");

	return {
		dir,
		git,
		write,
		edit,
	};
}

describe("which over-max functions the change is responsible for", () => {
	test("an edit inside the function and its fix's target blocks", () => {
		const repo = repository({ "a.js": BUSY });

		repo.edit("a.js", "seen.push(x);", "seen.push(x + 1);");

		const result = run(repo.dir);

		expect(result.status).toBe(1);

		expect(result.errors).toEqual([
			expect.stringMatching(
				/^a\.js:1:17: error complexity\(cognitive-complexity\): Function 'busy' at lines 1-13 /,
			),
		]);
	});

	test("an edit inside the function but outside its fix's target is a note, or blocks with --strict", () => {
		const repo = repository({ "a.js": BUSY });

		repo.edit("a.js", "const seen = [];", "const seen = [0];");

		const result = run(repo.dir);

		expect(result).toMatchObject({ status: 0, errors: [] });

		expect(result.notes).toEqual([expect.stringMatching(/^a\.js:1:17: note .*Function 'busy'/)]);

		expect(run(repo.dir, ["--strict"])).toMatchObject({ status: 1, notes: [] });
	});

	test("an edit to another function in the file reports nothing", () => {
		const repo = repository({ "a.js": BUSY });

		repo.edit("a.js", "return x;", "return x + 1;");

		expect(run(repo.dir)).toMatchObject({ status: 0, errors: [], notes: [] });

		expect(run(repo.dir, ["--strict"])).toMatchObject({ status: 0, errors: [], notes: [] });
	});

	test("an untracked file counts as changed throughout", () => {
		const repo = repository({ "a.js": "export const a = 1;\n" });

		repo.write("new.js", BUSY);

		expect(run(repo.dir)).toMatchObject({
			status: 1,
			errors: [expect.stringMatching(/^new\.js:/)],
		});
	});

	test("commits since the merge base count, and --base moves the base", () => {
		const repo = repository({ "a.js": BUSY });

		repo.edit("a.js", "seen.push(x);", "seen.push(x + 1);");

		repo.git("commit", "-qam", "change");

		expect(run(repo.dir).status).toBe(1);

		expect(run(repo.dir, ["--base", "work"])).toMatchObject({ status: 0, errors: [], notes: [] });
	});

	test("the default branch is origin/HEAD when it is set", () => {
		const repo = repository({ "a.js": BUSY });

		repo.git("branch", "-m", "main", "trunk");

		repo.git("update-ref", "refs/remotes/origin/trunk", "trunk");

		repo.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");

		repo.edit("a.js", "seen.push(x);", "seen.push(x + 1);");

		expect(run(repo.dir).status).toBe(1);
	});

	test("a deletion touches the lines around it", () => {
		const repo = repository({
			"a.js": BUSY.replace("seen.push(x);", "seen.push(x);\n\t\t\t\tlog(x);"),
		});

		repo.edit("a.js", "\n\t\t\t\tlog(x);", "");

		expect(run(repo.dir).status).toBe(1);
	});

	test("an edit inside a nested function that is itself reported doesn't touch the one around it", () => {
		const nested = `export function outer(xs, flag) {
	if (flag) {
		if (xs) {
			if (flag > 1) {
				log(xs);
			}
		}
	}

	return xs.map((x) => {
		if (x) {
			for (const y of x) {
				if (y) {
					if (y > 1) {
						log(y);
					}
				}
			}
		}

		return x;
	});
}
`;

		const repo = repository({ "a.js": nested });

		repo.edit("a.js", "log(y);", "log(y + 1);");

		const result = run(repo.dir, ["--strict"]);

		expect(result.errors).toEqual([expect.stringContaining("Callback passed to 'map'")]);
	});

	test("an edit inside a nested function scoring nothing still touches the one around it", () => {
		const repo = repository({
			"a.js": BUSY.replace("return seen;", "return seen.map((each) => {\n\t\treturn each;\n\t});"),
		});

		repo.edit("a.js", "return each;", "return each + 1;");

		expect(run(repo.dir, ["--strict"]).errors).toEqual([
			expect.stringContaining("Function 'busy'"),
		]);
	});
});

describe("max-params and other rules", () => {
	const params =
		"export function wide(a, b, c) {\n\treturn a;\n}\n\nexport function also(a, b, c) {\n\treturn a;\n}\n";

	test("max-params blocks when its parameter list changed, and only then", () => {
		const repo = repository({ "p.js": params });

		repo.edit("p.js", "wide(a, b, c)", "wide(a, b, c, d)");

		const result = run(repo.dir);

		expect(result.status).toBe(1);

		expect(result.errors).toEqual([
			expect.stringMatching(/^p\.js:1:21: error eslint\(max-params\)/),
		]);
	});

	test("max-params counts the lines of a parameter list that spans several, past non-ASCII text", () => {
		const repo = repository({
			"p.js": `const label = "é";\n\nexport function wide(\n\ta,\n\tb,\n\tc,\n) {\n\treturn a + label;\n}\n`,
		});

		repo.edit("p.js", "\tc,\n", "\tc,\n\td,\n");

		expect(run(repo.dir).status).toBe(1);
	});

	test("other rules are left to the project's own lint", () => {
		const repo = repository(
			{ "a.js": "export function f(x) {\n\treturn x;\n}\n" },
			{ "no-debugger": "error" },
		);

		repo.edit("a.js", "return x;", "debugger;\n\treturn x;");

		expect(run(repo.dir)).toMatchObject({ status: 0, errors: [], notes: [] });
	});

	test("a rule set to warn gives notes, not blocks", () => {
		const repo = repository({ "a.js": BUSY }, { "complexity/cognitive-complexity": ["warn", 3] });

		repo.edit("a.js", "seen.push(x);", "seen.push(x + 1);");

		expect(run(repo.dir)).toMatchObject({
			status: 0,
			errors: [],
			notes: [expect.stringContaining("Function 'busy'")],
		});
	});
});

describe("files", () => {
	test("positions in .vue files are counted from the top of the file, as the diff counts them", () => {
		const vue = `<template>\n\t<p>{{ busy([], true) }}</p>\n</template>\n\n<script setup>\n${BUSY}</script>\n`;
		const repo = repository({ "c.vue": vue });

		repo.edit("c.vue", "seen.push(x);", "seen.push(x + 1);");

		expect(run(repo.dir).errors).toEqual([expect.stringMatching(/^c\.vue:6:17: .*at lines 6-18 /)]);
	});

	test("paths given as arguments narrow the check, a directory to the files in it", () => {
		const repo = repository({ "a.js": BUSY, "b.js": BUSY, "lib/c.js": BUSY });

		for (const path of ["a.js", "b.js", "lib/c.js"]) {
			repo.edit(path, "seen.push(x);", "seen.push(x + 1);");
		}

		expect(run(repo.dir, [join(repo.dir, "b.js")]).errors).toEqual([
			expect.stringMatching(/^b\.js:/),
		]);

		expect(run(repo.dir, ["lib"]).errors).toEqual([expect.stringMatching(/^lib\/c\.js:/)]);
	});

	test("a renamed file counts only for the lines that changed in it", () => {
		const repo = repository({ "a.js": BUSY });

		repo.git("mv", "a.js", "moved.js");

		expect(run(repo.dir)).toMatchObject({ status: 0, errors: [], notes: [] });

		repo.edit("moved.js", "seen.push(x);", "seen.push(x + 1);");

		expect(run(repo.dir).errors).toEqual([expect.stringMatching(/^moved\.js:/)]);
	});

	test("an added line that looks like a file header is read as content", () => {
		const repo = repository({ "a.js": `let i = 0;\n${BUSY}` });

		// In the diff, this line reads `+++ i;`.
		repo.edit("a.js", "let i = 0;", "let i = 0;\n++ i;");

		repo.edit("a.js", "seen.push(x);", "seen.push(x + 1);");

		expect(run(repo.dir).status).toBe(1);
	});

	test("a path git quotes in the diff", () => {
		const repo = repository({ 'a"b.js': BUSY });

		repo.edit('a"b.js', "seen.push(x);", "seen.push(x + 1);");

		expect(run(repo.dir).errors).toEqual([expect.stringMatching(/^a"b\.js:/)]);
	});

	test("deleted files, files Oxlint doesn't lint and ignored files are skipped", () => {
		const repo = repository({ "a.js": BUSY, "notes.md": "# Notes\n" });

		unlinkSync(join(repo.dir, "a.js"));

		repo.write("notes.md", "# Notes\n\nMore.\n");

		repo.write(
			".oxlintrc.json",
			readFileSync(join(repo.dir, ".oxlintrc.json"), "utf8").replace(
				"{",
				'{"ignorePatterns":["skip/**"],',
			),
		);

		repo.git("add", ".oxlintrc.json");

		repo.write("skip/busy.js", BUSY);

		expect(run(repo.dir)).toMatchObject({ status: 0, errors: [], notes: [] });
	});

	test("git config that changes diff output doesn't change what's found", () => {
		const repo = repository({ "é.js": BUSY });

		for (const [key, value] of [
			["diff.noprefix", "true"],
			["diff.mnemonicPrefix", "true"],
			["diff.relative", "true"],
			["diff.renames", "copies"],
			["color.diff", "always"],
		]) {
			repo.git("config", key!, value!);
		}

		repo.edit("é.js", "seen.push(x);", "seen.push(x + 1);");

		expect(run(repo.dir).errors).toEqual([expect.stringMatching(/^é\.js:/)]);
	});
});

describe("when the check can't run", () => {
	test("outside a git repository", () => {
		const dir = mkdtempSync(join(tmpdir(), "complexity-checker-"));

		made.push(dir);

		expect(run(dir)).toMatchObject({
			status: 2,
			stderr: expect.stringContaining("not in a git repository"),
		});
	});

	test("with no default branch, or a --base with no merge base", () => {
		const repo = repository({ "a.js": BUSY });

		repo.git("branch", "-m", "main", "trunk");

		expect(run(repo.dir)).toMatchObject({ status: 2, stderr: expect.stringContaining("--base") });

		expect(run(repo.dir, ["--base", "nowhere"])).toMatchObject({
			status: 2,
			stderr: expect.stringContaining("no merge base"),
		});
	});

	test("with an Oxlint that can't run or prints no report", () => {
		const repo = repository({ "a.js": BUSY });

		repo.write("new.js", BUSY);

		expect(run(repo.dir, ["--oxlint", join(repo.dir, "missing")], false).status).toBe(2);

		expect(run(repo.dir, ["--oxlint", "/usr/bin/true"], false)).toMatchObject({
			status: 2,
			stderr: expect.stringContaining("didn't print its JSON report"),
		});
	});

	test("with a path outside the repository", () => {
		const repo = repository({ "a.js": BUSY });

		expect(run(repo.dir, [tmpdir()])).toMatchObject({
			status: 2,
			stderr: expect.stringContaining("outside the repository"),
		});
	});

	test("with nothing to lint, no Oxlint is needed", () => {
		const repo = repository({ "notes.md": "# Notes\n" });

		repo.write("notes.md", "# Notes\n\nMore.\n");

		expect(run(repo.dir, ["--oxlint", join(repo.dir, "missing")], false).status).toBe(0);
	});

	test("with an unknown option", () => {
		const repo = repository({ "a.js": BUSY });

		expect(run(repo.dir, ["--nope"]).status).toBe(2);
	});
});

// The README's command, run as Claude Code runs it: with `sh`, the hook's input on stdin,
// and `CLAUDE_PROJECT_DIR` set.
describe("the Claude Code hook in the README and the agent setup guide", () => {
	/** The hook settings in `doc`: its first JSON block holding a `PostToolUse` hook. */
	const settings = (doc: string) =>
		[...readFileSync(join(root, doc), "utf8").matchAll(/^```json\n([\s\S]*?)^```$/gm)]
			.map(([, body]) => body!)
			.find((body) => body.includes('"PostToolUse"'))!;

	const command = JSON.parse(settings("README.md")).hooks.PostToolUse[0].hooks[0].command as string;

	test("the guide gives the README's hook", () => {
		expect(settings("install.md")).toBe(settings("README.md"));
	});

	/** A repository whose `node_modules/.bin/complexity-hints` runs the checker from source. */
	function installed(files: Record<string, string>) {
		const repo = repository(files);

		repo.write(".gitignore", "node_modules/\n");

		repo.write(
			"node_modules/.bin/complexity-hints",
			`#!/bin/sh\nexec "${process.execPath}" "${cli}" --oxlint "${oxlint}" "$@"\n`,
		);

		chmodSync(join(repo.dir, "node_modules/.bin/complexity-hints"), 0o755);

		return repo;
	}

	// Run from elsewhere: Claude Code's working directory needn't be the project's.
	function hook(dir: string, input: object | string, shell = command, cwd = tmpdir()) {
		const result = spawnSync("/bin/sh", ["-c", shell], {
			cwd,
			encoding: "utf8",
			env: { ...env, CLAUDE_PROJECT_DIR: dir },
			input: typeof input === "string" ? input : JSON.stringify(input),
			timeout: 60_000,
		});

		return { status: result.status, stdout: result.stdout, stderr: result.stderr };
	}

	const edit = (path: string) => ({ tool_name: "Edit", tool_input: { file_path: path } });

	const bash = (changedFiles?: string[]) => ({
		tool_name: "Bash",
		tool_input: { command: "sed -i '' s/x/y/ a.js" },
		tool_response: changedFiles ? { bashEditDiff: { changedFiles } } : {},
	});

	test("an edit that blocks exits 2, with the diagnostics on stderr for the agent", () => {
		const repo = installed({ "a.js": BUSY });

		repo.edit("a.js", "seen.push(x);", "seen.push(x + 1);");

		const result = hook(repo.dir, edit(join(repo.dir, "a.js")));

		expect(result).toMatchObject({ status: 2, stdout: "" });

		expect(result.stderr).toMatch(/^a\.js:1:17: error complexity\(cognitive-complexity\): /);
	});

	test("an edit that only gives notes exits 0", () => {
		const repo = installed({ "a.js": BUSY });

		repo.edit("a.js", "const seen = [];", "const seen = [0];");

		expect(hook(repo.dir, edit(join(repo.dir, "a.js")))).toMatchObject({
			status: 0,
			stderr: expect.stringContaining("a.js:1:17: note "),
		});
	});

	test("a Bash command checks the files it changed, and one that changed none passes", () => {
		const repo = installed({ "a.js": BUSY, "b.js": BUSY });

		repo.edit("a.js", "seen.push(x);", "seen.push(x + 1);");

		expect(hook(repo.dir, bash([join(repo.dir, "a.js")])).status).toBe(2);

		expect(hook(repo.dir, bash([join(repo.dir, "b.js")])).status).toBe(0);

		expect(hook(repo.dir, bash())).toMatchObject({ status: 0, stderr: "" });
	});

	test("a file outside the project, or the project's directory itself, passes", () => {
		const repo = installed({ "a.js": BUSY });

		repo.edit("a.js", "seen.push(x);", "seen.push(x + 1);");

		for (const input of [edit(join(tmpdir(), "notes.js")), bash([repo.dir])]) {
			expect(hook(repo.dir, input)).toMatchObject({ status: 0, stderr: "" });
		}
	});

	test("without CLAUDE_PROJECT_DIR, the project is the current directory", () => {
		const repo = installed({ "a.js": BUSY });

		repo.edit("a.js", "seen.push(x);", "seen.push(x + 1);");

		const shell = `unset CLAUDE_PROJECT_DIR; node_modules/.bin/complexity-hints --claude-code-hook`;

		expect(hook(repo.dir, edit(join(repo.dir, "a.js")), shell, repo.dir).status).toBe(2);
	});

	test("a check that can't run fails without exit 2, so it doesn't block the agent", () => {
		const repo = installed({ "a.js": BUSY });

		repo.edit("a.js", "seen.push(x);", "seen.push(x + 1);");

		repo.git("branch", "-m", "main", "trunk");

		expect(hook(repo.dir, edit(join(repo.dir, "a.js")))).toMatchObject({
			status: 1,
			stderr: expect.stringContaining("--base"),
		});

		for (const input of ["not json", "null"]) {
			expect(hook(repo.dir, input)).toMatchObject({
				status: 1,
				stderr: expect.stringContaining("hook's JSON input"),
			});
		}

		expect(hook(repo.dir, edit(join(repo.dir, "a.js")), `${command} a.js`)).toMatchObject({
			status: 1,
			stderr: expect.stringContaining("not arguments"),
		});

		rmSync(join(repo.dir, "node_modules"), { recursive: true });

		// Not installed: the shell's 127, which Claude Code shows the user without blocking.
		expect(hook(repo.dir, edit(join(repo.dir, "a.js"))).status).toBe(127);
	});
});

describe("reading the rule's message", () => {
	const message = (label: string, fix: string) =>
		`${label} at lines 10-40 has cognitive complexity 20, over the max of 15; main contributors: 'if' at line 12 (+3, nested 2 deep); fix: ${fix}.`;

	test.each([
		[
			"move lines 19-22 (the body of the 'for...of' at line 18) into a new function; this one drops to 3 and the new one scores 3",
			19,
			22,
		],
		["move line 30 into a new function; this one drops to 9 and the new one scores 7", 30, 30],
		[
			"invert the 'if' at line 12 into a guard clause that returns early, so its body moves up a level; this one drops to 15",
			12,
			12,
		],
		[
			"move the '?:' at line 25, column 43, into a helper function; this one drops to 14 and the helper scores 3",
			25,
			25,
		],
		// The fallback gives a direction, so it targets the whole function.
		["split the condition at line 14 into named helper functions", 10, 40],
		["replace the else-if chain at line 16 with a switch or a lookup table", 10, 40],
		["split the code around line 18 into smaller functions", 10, 40],
	])("the target of %s", (fix, first, last) => {
		expect(parseMessage(message("Function 'f'", fix))).toEqual({
			function: { first: 10, last: 40 },
			target: { first, last },
		});
	});

	test("a label holding text like the range", () => {
		expect(
			parseMessage(
				message("Method 'at line 3 has'", "split the code around line 18 into smaller functions"),
			)?.function,
		).toEqual({ first: 10, last: 40 });
	});

	test("a single-line function, and any other message", () => {
		expect(
			parseMessage(
				"Function 'f' at line 4 has cognitive complexity 2, over the max of 0; main contributors: 'if' at line 4 (+1); fix: split the code around line 4 into smaller functions.",
			),
		).toEqual({
			function: { first: 4, last: 4 },
			target: { first: 4, last: 4 },
		});

		expect(
			parseMessage("Function has too many parameters (3). Maximum allowed is 2."),
		).toBeUndefined();
	});
});

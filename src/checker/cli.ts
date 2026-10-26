#!/usr/bin/env node
// `complexity-hints`: Oxlint on a change, reporting only what the change is responsible
// for. See docs/specs/scoped-checker.md.
import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { changedLines, repositoryRoot, resolveBase, SetupError } from "./changes.ts";
import { hookFiles } from "./claude-code.ts";
import { findOxlint, lint, type Diagnostic } from "./oxlint.ts";
import { scopeFile } from "./scope.ts";

const USAGE = `Usage: complexity-hints [--base <ref>] [--strict] [--oxlint <path>] [<path>...]
       complexity-hints --claude-code-hook [--base <ref>] [--strict] [--oxlint <path>]

Runs Oxlint on the change since the merge base with the default branch, and reports only
the diagnostics the change is responsible for.

  --base <ref>     compare against the merge base of HEAD and <ref>
  --strict         block on every over-max function the change touches
  --oxlint <path>  run this Oxlint (or vp) binary from the current directory
  <path>...        check only these files
  --claude-code-hook
                   run as a Claude Code PostToolUse hook: check the project files the
                   tool call changed, read from the hook's input on stdin, and print to
                   stderr

Exits 0 when nothing blocks, 1 when something does, and 2 when the check can't run. As a
hook, exits 2 when something blocks, so Claude Code shows it to the agent, and 1 when the
check can't run, so it shows the user an error without blocking the agent.`;

const LINTED = new Set([
	".js",
	".jsx",
	".ts",
	".tsx",
	".mjs",
	".cjs",
	".mts",
	".cts",
	".vue",
	".svelte",
	".astro",
]);

function options(args: string[]) {
	try {
		return parseArgs({
			args,
			allowPositionals: true,
			options: {
				base: { type: "string" },
				strict: { type: "boolean", default: false },
				oxlint: { type: "string" },
				"claude-code-hook": { type: "boolean", default: false },
				help: { type: "boolean", default: false },
			},
		});
	} catch (error) {
		throw new SetupError(`${(error as Error).message}\n\n${USAGE}`);
	}
}

/** `path` with symlinks resolved, as far as it exists. */
function real(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

/**
 * An absolute path relative to `dir`, `""` for `dir` itself, or undefined when it's
 * outside. Only the parent's symlinks are resolved, so a symlink named stays itself.
 */
function within(dir: string, path: string): string | undefined {
	const inside = relative(dir, join(real(dirname(path)), basename(path)));

	return inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)
		? undefined
		: inside.split(sep).join("/");
}

function inRepository(root: string, path: string): string {
	const inside = within(root, path);

	if (inside === undefined) {
		throw new SetupError(`${path} is outside the repository`);
	}

	return inside;
}

function line(diagnostic: Diagnostic, path: string, kind: string): string {
	const { line, column } = diagnostic.labels[0]!.span;

	return `${path}:${line}:${column}: ${kind} ${diagnostic.code}: ${diagnostic.message}`;
}

type Options = ReturnType<typeof options>["values"];

/**
 * Checks the change, narrowed to `paths`, from `cwd`, and prints the result with
 * `print`; returns the exit code.
 */
function check(values: Options, paths: string[], cwd: string, print: (line: string) => void) {
	const root = repositoryRoot(cwd);
	const changes = changedLines(root, resolveBase(root, values.base));
	const wanted = paths.map((path) => inRepository(root, resolve(cwd, path)));

	const files = [...changes.keys()].filter(
		(file) =>
			LINTED.has(extname(file)) &&
			(wanted.length === 0 ||
				wanted.some((path) => path === "" || file === path || file.startsWith(`${path}/`))),
	);

	if (files.length === 0) {
		return 0;
	}

	const runner = findOxlint(cwd, values.oxlint);

	const diagnostics = lint(
		runner,
		files.map((file) => relative(runner.cwd, join(root, file))),
	);

	// Map.groupBy needs Node 21; the floor is 20.
	const byFile = new Map<string, Diagnostic[]>();

	for (const diagnostic of diagnostics) {
		const file = relative(root, resolve(runner.cwd, diagnostic.filename));

		const inFile = byFile.get(file);

		if (inFile) {
			inFile.push(diagnostic);
		} else {
			byFile.set(file, [diagnostic]);
		}
	}

	const blocks: string[] = [];
	const notes: string[] = [];

	for (const [file, inFile] of byFile) {
		const changed = changes.get(file);

		if (!changed) {
			continue;
		}

		const shown = relative(cwd, join(root, file));
		const scoped = scopeFile(inFile, changed, join(root, file), values.strict);

		blocks.push(...scoped.blocks.map((each) => line(each, shown, "error")));

		notes.push(...scoped.notes.map((each) => line(each, shown, "note")));
	}

	for (const each of blocks) {
		print(each);
	}

	if (notes.length > 0) {
		print("Not blocking: the fix points outside the change, or the rule is set to warn.");

		for (const each of notes) {
			print(each);
		}
	}

	return blocks.length > 0 ? 1 : 0;
}

/**
 * As a Claude Code hook: the project files the tool call changed, from the hook's input,
 * checked from the project's directory, with the result on stderr, which Claude Code
 * shows the agent.
 */
function checkHook(values: Options, paths: string[]): number {
	if (paths.length > 0) {
		throw new SetupError("--claude-code-hook takes its files from the hook's input, not arguments");
	}

	const project = real(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());

	// A file, not the project's directory itself, which would stand for the whole change.
	const files = hookFiles(readFileSync(0, "utf8"))
		.map((file) => resolve(project, file))
		.filter((file) => within(project, file));

	return files.length === 0 ? 0 : check(values, files, project, console.error);
}

/** The exit code, as a hook when `hook` says so. */
function main(args: string[], hook: { mode: boolean }): number {
	const { values, positionals } = options(args);

	hook.mode = values["claude-code-hook"];

	if (values.help) {
		console.log(USAGE);

		return 0;
	}

	return hook.mode
		? checkHook(values, positionals)
		: check(values, positionals, real(process.cwd()), console.log);
}

// Claude Code shows a hook's stderr to the agent on exit 2, and to the user on any other
// failure. Until the arguments parse, the flag's presence decides.
const hook = { mode: process.argv.includes("--claude-code-hook") };

try {
	const code = main(process.argv.slice(2), hook);

	process.exitCode = hook.mode && code === 1 ? 2 : code;
} catch (error) {
	// Anything unexpected is a failure to check, never a finding.
	const detail = error instanceof SetupError ? error.message : String((error as Error).stack);

	console.error(`complexity-hints: ${detail}`);

	process.exitCode = hook.mode ? 1 : 2;
}

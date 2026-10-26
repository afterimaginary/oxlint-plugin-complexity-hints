#!/usr/bin/env node
// `complexity-hints`: Oxlint on a change, reporting only what the change is responsible
// for. See docs/specs/scoped-checker.md.
import { realpathSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { parseArgs } from "node:util";
import { changedLines, repositoryRoot, resolveBase, SetupError } from "./changes.ts";
import { findOxlint, lint, type Diagnostic } from "./oxlint.ts";
import { scopeFile } from "./scope.ts";

const USAGE = `Usage: complexity-hints [--base <ref>] [--strict] [--oxlint <path>] [<path>...]

Runs Oxlint on the change since the merge base with the default branch, and reports only
the diagnostics the change is responsible for.

  --base <ref>     compare against the merge base of HEAD and <ref>
  --strict         block on every over-max function the change touches
  --oxlint <path>  run this Oxlint (or vp) binary from the current directory
  <path>...        check only these files

Exits 0 when nothing blocks, 1 when something does, and 2 when the check can't run.`;

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
 * An absolute path relative to the repository root, `""` for the root itself. Only the
 * parent's symlinks are resolved, so a symlink named on the command line stays itself.
 */
function inRepository(root: string, path: string): string {
	const inside = relative(root, join(real(dirname(path)), basename(path)));

	if (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
		throw new SetupError(`${path} is outside the repository`);
	}

	return inside.split(sep).join("/");
}

function line(diagnostic: Diagnostic, path: string, kind: string): string {
	const { line, column } = diagnostic.labels[0]!.span;

	return `${path}:${line}:${column}: ${kind} ${diagnostic.code}: ${diagnostic.message}`;
}

/** Checks the change and prints the result; returns the exit code. */
function check(args: string[]): number {
	const { values, positionals } = options(args);

	if (values.help) {
		console.log(USAGE);

		return 0;
	}

	const cwd = real(process.cwd());
	const root = repositoryRoot(cwd);
	const changes = changedLines(root, resolveBase(root, values.base));
	const wanted = positionals.map((path) => inRepository(root, resolve(cwd, path)));

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
		console.log(each);
	}

	if (notes.length > 0) {
		console.log("Not blocking: the fix points outside the change, or the rule is set to warn.");

		for (const each of notes) {
			console.log(each);
		}
	}

	return blocks.length > 0 ? 1 : 0;
}

try {
	process.exitCode = check(process.argv.slice(2));
} catch (error) {
	// Anything unexpected is a failure to check, never a finding.
	const detail = error instanceof SetupError ? error.message : String((error as Error).stack);

	console.error(`complexity-hints: ${detail}`);

	process.exitCode = 2;
}

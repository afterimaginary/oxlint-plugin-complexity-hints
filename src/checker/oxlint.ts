// Finding the project's own Oxlint and running it for its JSON report. See
// docs/designs/scoped-checker.md.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { SetupError } from "./changes.ts";

/** One diagnostic in Oxlint's JSON report. */
export interface Diagnostic {
	message: string;
	code: string;
	severity: string;
	filename: string;
	labels: { span: { offset: number; length: number; line: number; column: number } }[];
}

/** How to run Oxlint: the command, the arguments before Oxlint's own, where, and with what environment. */
export interface Runner {
	command: string;
	args: string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
}

// Vite+ sets `VP_VERSION`, which makes a plain `oxlint` read its config as a Vite+ one and
// skip `.oxlintrc.json`, so a run under `vp run` would lint with no rules at all.
const { VP_VERSION: _vp, ...plainEnv } = process.env;

// The `oxlint` that Vite+ installs only serves editors, and the lint config lives in
// `vite.config.ts`, which only `vp lint` reads; so `vp` wins.
function runnerFor(binary: string, cwd: string): Runner {
	const vp = /^vp(?:\.cmd|\.exe)?$/i.test(basename(binary));

	return {
		command: binary,
		args: vp ? ["lint"] : [],
		cwd,
		env: vp ? process.env : plainEnv,
	};
}

/**
 * `binary` from the current directory when given; otherwise the nearest
 * `node_modules/.bin` up from `cwd` that holds `vp` or `oxlint`, run from the directory
 * that holds it, so the project's config applies.
 */
export function findOxlint(cwd: string, binary?: string): Runner {
	if (binary) {
		return runnerFor(binary, cwd);
	}

	for (let dir = cwd; ; dir = dirname(dir)) {
		const found = ["vp", "oxlint"]
			.map((name) => join(dir, "node_modules/.bin", name))
			.find((path) => existsSync(path));

		if (found) {
			return runnerFor(found, dir);
		}

		if (dirname(dir) === dir) {
			throw new SetupError("no Oxlint found in node_modules/.bin; pass --oxlint <path>");
		}
	}
}

// Well under the smallest common limit on a command line's length.
const MAX_ARGS_LENGTH = 30_000;

function chunks(files: readonly string[]): string[][] {
	const result: string[][] = [[]];
	let length = 0;

	for (const file of files) {
		if (length + file.length > MAX_ARGS_LENGTH && result.at(-1)!.length > 0) {
			result.push([]);

			length = 0;
		}

		result.at(-1)!.push(file);

		length += file.length + 1;
	}

	return result;
}

function run({ command, args, cwd, env }: Runner, files: readonly string[]): Diagnostic[] {
	const result = spawnSync(
		command,
		[...args, "--format", "json", "--no-error-on-unmatched-pattern", ...files],
		{
			cwd,
			env,
			encoding: "utf8",
			maxBuffer: 1 << 28,
		},
	);

	if (result.error) {
		throw new SetupError(`couldn't run ${command}: ${result.error.message}`);
	}

	// Oxlint exits 1 whenever it finds an error, so its report, not its exit code, says
	// whether it ran.
	try {
		return (JSON.parse(result.stdout) as { diagnostics: Diagnostic[] }).diagnostics;
	} catch {
		throw new SetupError(
			`${command} didn't print its JSON report:\n${result.stdout}${result.stderr}`,
		);
	}
}

/** Oxlint's diagnostics for `files`, given relative to the runner's directory. */
export function lint(runner: Runner, files: readonly string[]): Diagnostic[] {
	return files.length === 0 ? [] : chunks(files).flatMap((chunk) => run(runner, chunk));
}

// Scores a finished run from its final tree: did the function reach the max, do the
// rule's tests pass, did the run stay within the task, and does the rule still behave the
// same. See "What counts" in docs/designs/agent-benchmark.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "@typescript-eslint/parser";
import { RULE, countFunctions, scoreOf } from "../apply-hints.ts";
import { lint, root, run } from "../eval-repos.mjs";
import { baseDir, benchDir, bundleDir, corpusDir, sha256 } from "./prepare.mjs";
import { runTests, testFile } from "./tasks.mjs";

const cacheDir = join(benchDir, "behavior-cache");
const WORKER = join(root, "scripts/agent-benchmark/behavior-worker.cjs");

/** Any arm's plugin scores the same; B's is the one the rest of the scoring reads. */
const SCORER = join(bundleDir, "B.mjs");

/** The slowest rule's check, indent's, takes minutes; a rule left looping fails. */
const BEHAVIOR_TIMEOUT = 30 * 60_000;

const DIRECTIVE = /^\s*(?:eslint|oxlint)-disable/;

/** Disable directives in `source`: comments that start with one, not text that mentions one. */
function directives(source) {
	try {
		return parse(source, { comment: true, range: true, sourceType: "module" }).comments.filter(
			({ value }) => DIRECTIVE.test(value),
		).length;
	} catch {
		// A file that doesn't parse can't succeed anyway; count anything that looks like one.
		return source.match(/(?:\/\/|\/\*)\s*(?:eslint|oxlint)-disable/g)?.length ?? 0;
	}
}

/** How many functions `source` declares, or undefined if it doesn't parse. */
function functionsIn(source, file) {
	try {
		return countFunctions(source, file);
	} catch {
		return undefined;
	}
}

/** Git in the run's snapshot repository, over its working tree. */
export function snapshotGit(workspace, args) {
	const result = run(
		"git",
		[
			`--git-dir=${join(workspace.meta, "snapshots.git")}`,
			`--work-tree=${workspace.work}`,
			...args,
		],
		workspace.work,
	);

	if (result.status !== 0) {
		throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
	}

	return result.stdout;
}

/** Runs the behavior check, computing the original rule's results first if they aren't cached. */
export function behavior(work, rule) {
	mkdirSync(cacheDir, { recursive: true });

	// The original's results depend on the worker, the rule and its tests, so the cache does too.
	const key = sha256(
		[WORKER, join(baseDir, "lib/rules", `${rule}.js`), join(baseDir, testFile(rule))]
			.map((file) => readFileSync(file, "utf8"))
			.join("\0"),
	).slice(0, 16);

	let result;

	try {
		result = run(
			process.execPath,
			[WORKER, baseDir, work, rule, join(cacheDir, `${rule}-${key}.json`), corpusDir],
			baseDir,
			{ timeout: BEHAVIOR_TIMEOUT },
		);
	} catch (error) {
		return { same: false, error: `${error.code ?? error}: the check didn't finish` };
	}

	if (result.status !== 0) {
		return {
			same: false,
			error:
				result.stderr.split("\n").find((line) => /Error/.test(line)) ?? result.stderr.slice(0, 300),
		};
	}

	const summary = JSON.parse(result.stdout);

	return {
		same: summary.differences.length === 0 && summary.compared === summary.checks,
		...summary,
	};
}

/** Scores in the given files at a max of 0, so every function with a score shows. */
function scores(work, files) {
	const report = lint(work, files, { max: 0, plugin: SCORER });

	return report.diagnostics
		.filter(({ code }) => code === RULE)
		.map(({ message }) => scoreOf(message));
}

export function score(workspace, task) {
	const changes = snapshotGit(workspace, [
		"diff",
		"--name-status",
		"--no-renames",
		"baseline",
		"HEAD",
	])
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => {
			const [status, file] = line.split("\t");

			return { status, file };
		});

	const diff = snapshotGit(workspace, ["diff", "baseline", "HEAD"]);

	writeFileSync(join(workspace.meta, "final.diff"), diff);

	const outside = changes.filter(
		({ status, file }) =>
			file !== task.file && !(status === "A" && /^lib\/rules\/.*\.js$/.test(file)),
	);

	const targetExists = existsSync(join(workspace.work, task.file));

	// The target is always scored, and so is every other source file the run wrote.
	const sources = [
		...new Set([
			...(targetExists ? [task.file] : []),
			...changes
				.filter(
					({ status, file }) => status !== "D" && file.startsWith("lib/") && file.endsWith(".js"),
				)
				.map(({ file }) => file),
		]),
	];

	const read = (dir, file) =>
		existsSync(join(dir, file)) ? readFileSync(join(dir, file), "utf8") : undefined;

	// Directives added to any file the run wrote; moving an existing one doesn't count.
	const disableComments = changes
		.filter(({ status }) => status !== "D")
		.reduce((sum, { file }) => {
			const before = read(baseDir, file);

			return (
				sum +
				Math.max(0, directives(read(workspace.work, file)) - (before ? directives(before) : 0))
			);
		}, 0);

	const integrity = {
		ok: outside.length === 0 && disableComments === 0 && targetExists,
		outside: outside.map(({ status, file }) => `${status} ${file}`),
		disableComments,
	};

	// Oxlint reports a file it can't parse with no scores, so parsing is checked on its own.
	const unparsed = sources.filter(
		(file) => functionsIn(read(workspace.work, file), file) === undefined,
	);

	const remaining = sources.length > 0 ? scores(workspace.work, sources) : [];

	const reachedMax =
		targetExists && unparsed.length === 0 && remaining.every((value) => value <= 15);

	const tests = runTests(workspace.work, task.rule);

	const behaves =
		integrity.ok && tests.passed
			? behavior(workspace.work, task.rule)
			: { same: false, skipped: true };

	/** Lines added and removed, with or without whitespace-only changes. */
	const lines = (...flags) => {
		const rows = snapshotGit(workspace, ["diff", "--numstat", ...flags, "baseline", "HEAD"])
			.trim()
			.split("\n")
			.filter(Boolean)
			.map((line) => line.split("\t"));

		return {
			added: rows.reduce((sum, [plus]) => sum + Number(plus || 0), 0),
			removed: rows.reduce((sum, [, minus]) => sum + Number(minus || 0), 0),
		};
	};

	const ignoringWhitespace = lines("-w");
	const withWhitespace = lines();
	const before = functionsIn(read(baseDir, task.file), task.file);

	return {
		success: reachedMax && tests.passed && integrity.ok && behaves.same,
		reachedMax,
		testsPassed: tests.passed,
		testOutput: tests.passed ? undefined : tests.output,
		integrity,
		unparsed,
		behavior: behaves,
		diff: {
			files: changes.length,
			...ignoringWhitespace,
			withWhitespace,
			functionsAdded:
				unparsed.length > 0
					? undefined
					: sources.reduce(
							(sum, file) =>
								sum +
								functionsIn(read(workspace.work, file), file) -
								(file === task.file ? before : 0),
							0,
						),
			highestScoreLeft: unparsed.length > 0 ? undefined : Math.max(0, ...remaining),
		},
	};
}

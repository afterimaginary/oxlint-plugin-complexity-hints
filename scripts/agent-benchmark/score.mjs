// Scores a finished run from its final tree: did the function reach the max, do the
// rule's tests pass, did the run stay within the task, and does the rule still behave the
// same. See "What counts" in docs/designs/agent-benchmark.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RULE, countFunctions, scoreOf } from "../apply-hints.ts";
import { lint, root, run } from "../eval-repos.mjs";
import { baseDir, benchDir, bundleDir } from "./prepare.mjs";
import { runTests } from "./tasks.mjs";

const cacheDir = join(benchDir, "behavior-cache");

/** Any arm's plugin scores the same; B's is the one the rest of the scoring reads. */
const SCORER = join(bundleDir, "B.mjs");

const DISABLE = /(?:eslint|oxlint)-disable/;

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

	const result = run(
		process.execPath,
		[
			join(root, "scripts/agent-benchmark/behavior-worker.cjs"),
			baseDir,
			work,
			rule,
			join(cacheDir, `${rule}.json`),
		],
		baseDir,
	);

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

	const added = diff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));

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

	const integrity = {
		ok: outside.length === 0 && !added.some((line) => DISABLE.test(line)) && targetExists,
		outside: outside.map(({ status, file }) => `${status} ${file}`),
		disableComments: added.filter((line) => DISABLE.test(line)).length,
	};

	const remaining = sources.length > 0 ? scores(workspace.work, sources) : [];
	const reachedMax = targetExists && remaining.every((value) => value <= 15);
	const tests = runTests(workspace.work, task.rule);

	const behaves =
		integrity.ok && tests.passed
			? behavior(workspace.work, task.rule)
			: { same: false, skipped: true };

	const numstat = snapshotGit(workspace, ["diff", "--numstat", "-w", "baseline", "HEAD"])
		.trim()
		.split("\n")
		.filter(Boolean)
		.map((line) => line.split("\t"));

	const functions = (text) => countFunctions(text, task.file);
	const before = readFileSync(join(baseDir, task.file), "utf8");

	return {
		success: reachedMax && tests.passed && integrity.ok && behaves.same,
		reachedMax,
		testsPassed: tests.passed,
		testOutput: tests.passed ? undefined : tests.output,
		integrity,
		behavior: behaves,
		diff: {
			files: changes.length,
			added: numstat.reduce((sum, [plus]) => sum + Number(plus || 0), 0),
			removed: numstat.reduce((sum, [, minus]) => sum + Number(minus || 0), 0),
			functionsAdded: sources.reduce((sum, file) => {
				const path = join(workspace.work, file);
				const after = functions(readFileSync(path, "utf8"));

				return sum + after - (file === task.file ? functions(before) : 0);
			}, 0),
			highestScoreLeft: Math.max(0, ...remaining),
		},
	};
}

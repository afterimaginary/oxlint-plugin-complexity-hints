// The tasks a benchmark runs, and where its runs' records are kept.
import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { baseDir, benchDir } from "./prepare.mjs";
import { TASKS_FILE } from "./tasks.mjs";
import { removeWorkspace } from "./workspace.mjs";

export const resultsDir = join(benchDir, "results");

/** Every task, split tasks first, in the order they're run and cut. */
export function loadTasks() {
	const { split, same } = JSON.parse(readFileSync(TASKS_FILE, "utf8"));

	return [...split, ...same];
}

export function findTask(tasks, rule) {
	const task = tasks.find((candidate) => candidate.rule === rule);

	if (!task) {
		throw new Error(`No task for ${rule}`);
	}

	return task;
}

/** One line per run, for the terminal. */
export function summarize(record) {
	const { score: result, outcome } = record;
	const cost = record.result?.costUsd?.toFixed(3) ?? "?";

	const verdict = result
		? `${result.success ? "success" : "fail"} (max ${result.reachedMax}, tests ${result.testsPassed}, integrity ${result.integrity.ok}, behavior ${result.behavior.same}) left ${result.diff.highestScoreLeft}, +${result.diff.added}/-${result.diff.removed}`
		: outcome.reason;

	return `${record.rule} ${record.arm}: ${outcome.kind}, ${verdict}; ${record.result?.turns ?? "?"} turns, $${cost}`;
}

/** The base tree's git objects, copied once beside the results, which every snapshot builds on. */
const baseObjects = join(resultsDir, "base-objects");

/**
 * Keeps a run's records under `folder` and drops its tree, which the snapshots can rebuild.
 * The snapshots borrow the base tree's objects from the copy in the results, through a
 * relative path, so the results folder holds everything and can be moved as a whole.
 */
export function keep(workspace, ...folder) {
	const dir = join(resultsDir, ...folder, workspace.id);

	if (!existsSync(baseObjects)) {
		cpSync(join(baseDir, ".git/objects"), baseObjects, { recursive: true });
	}

	mkdirSync(dir, { recursive: true });

	// Sockets and pipes a run left in /tmp can't be copied, and hold nothing to keep.
	cpSync(workspace.meta, dir, {
		recursive: true,
		filter: (path) => {
			const stat = lstatSync(path);

			return stat.isFile() || stat.isDirectory() || stat.isSymbolicLink();
		},
	});

	const alternates = join(dir, "snapshots.git/objects/info/alternates");

	writeFileSync(alternates, `${relative(dirname(dirname(alternates)), baseObjects)}\n`);

	removeWorkspace(workspace);

	return dir;
}

/** A run's record: `run.json` in a folder named by the run's id, not a file a run left in /tmp. */
export const RECORD = /(?:^|\/)[0-9a-f]{12}\/run\.json$/;

/** Every run record under `folder`, at any depth. */
export function readRecords(...folder) {
	const dir = join(resultsDir, ...folder);

	if (!existsSync(dir)) {
		return [];
	}

	return readdirSync(dir, { recursive: true })
		.filter((path) => RECORD.test(path))
		.map((path) => JSON.parse(readFileSync(join(dir, path), "utf8")));
}

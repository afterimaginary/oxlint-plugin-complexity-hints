// The tasks a benchmark runs, and where its runs' records are kept.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { benchDir } from "./prepare.mjs";
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

/** Keeps a run's records under `folder` and drops its tree, which the snapshots can rebuild. */
export function keep(workspace, ...folder) {
	const dir = join(resultsDir, ...folder, workspace.id);

	mkdirSync(dir, { recursive: true });

	cpSync(workspace.meta, dir, { recursive: true });

	removeWorkspace(workspace);

	return dir;
}

/** Every run record under `folder`, at any depth. */
export function readRecords(...folder) {
	const dir = join(resultsDir, ...folder);

	if (!existsSync(dir)) {
		return [];
	}

	return readdirSync(dir, { recursive: true })
		.filter((path) => path.endsWith("run.json"))
		.map((path) => JSON.parse(readFileSync(join(dir, path), "utf8")));
}

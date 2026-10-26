// The agent benchmark's analysis, as fixed in docs/designs/agent-benchmark.md: per task,
// the mean of each arm's runs; across tasks, the mean difference between arms, with a
// 95% bootstrap interval over tasks and then runs. Only complete blocks count.
//
//   node scripts/agent-benchmark/analyze.mjs --label <name> [--model <id>]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readRecords, resultsDir } from "./records.mjs";
import { random } from "./tasks.mjs";

const RESAMPLES = 10_000;
const SEED = 20261025;

/** The measures compared between arms; `all` averages over every run, failures included. */
export const MEASURES = {
	success: (record) => (record.score?.success ? 1 : 0),
	cost: (record) => record.result?.costUsd ?? 0,
	linesChanged: (record) =>
		record.score ? record.score.diff.added + record.score.diff.removed : 0,
	turns: (record) => record.result?.turns ?? 0,
};

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** Runs from complete blocks only, so every task and arm has the same number of runs. */
export function countedRecords(label) {
	const dir = join(resultsDir, label);

	if (!existsSync(dir)) {
		return [];
	}

	return readdirSync(dir)
		.filter((name) => /^block-\d+$/.test(name))
		.filter((name) => JSON.parse(readFileSync(join(dir, name, "block.json"), "utf8")).complete)
		.flatMap((name) => readRecords(label, name))
		.filter((record) => record.outcome.kind === "model");
}

/** `records` grouped by task, then by arm. */
function byTask(records) {
	const tasks = new Map();

	for (const record of records) {
		const arms = tasks.get(record.rule) ?? new Map();

		arms.set(record.arm, [...(arms.get(record.arm) ?? []), record]);

		tasks.set(record.rule, arms);
	}

	return tasks;
}

/**
 * The mean over tasks of `measure` under `treated` less under `control`, on the tasks that
 * have both, with its 95% interval: tasks resampled, then each arm's runs within a task.
 */
export function difference(records, measure, treated, control, seed = SEED) {
	const pairs = [...byTask(records).values()]
		.filter((arms) => arms.has(treated) && arms.has(control))
		.map((arms) => [arms.get(treated).map(measure), arms.get(control).map(measure)]);

	if (pairs.length === 0) {
		return undefined;
	}

	const estimate = mean(pairs.map(([a, b]) => mean(a) - mean(b)));
	const next = random(seed);
	const pick = (values) => values[Math.floor(next() * values.length)];
	const resample = (values) => values.map(() => pick(values));
	const draws = [];

	for (let i = 0; i < RESAMPLES; i++) {
		const tasks = resample(pairs);

		draws.push(mean(tasks.map(([a, b]) => mean(resample(a)) - mean(resample(b)))));
	}

	draws.sort((a, b) => a - b);

	return {
		estimate,
		low: draws[Math.floor(RESAMPLES * 0.025)],
		high: draws[Math.ceil(RESAMPLES * 0.975) - 1],
		tasks: pairs.length,
	};
}

/** The pre-registered claim: success no worse by more than 0.10, and cheaper or smaller. */
export function primaryClaim(records) {
	const success = difference(records, MEASURES.success, "B", "A");
	const cost = difference(records, MEASURES.cost, "B", "A");
	const lines = difference(records, MEASURES.linesChanged, "B", "A");

	return {
		success,
		cost,
		lines,
		holds: success.low >= -0.1 && (cost.high < 0 || lines.high < 0),
	};
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: { label: { type: "string" }, model: { type: "string" } },
	});

	const records = countedRecords(values.label).filter(
		(record) => !values.model || record.model === values.model,
	);

	console.log(`${records.length} counted runs`);

	for (const [name, measure] of Object.entries(MEASURES)) {
		for (const [treated, control] of [
			["B", "A"],
			["C", "B"],
		]) {
			const result = difference(records, measure, treated, control);

			if (result) {
				console.log(
					`${name} ${treated}-${control} over ${result.tasks} tasks: ${result.estimate.toFixed(3)} [${result.low.toFixed(3)}, ${result.high.toFixed(3)}]`,
				);
			}
		}
	}
}

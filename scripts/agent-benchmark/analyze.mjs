// The agent benchmark's analysis, as fixed in docs/designs/agent-benchmark.md: per task,
// the mean of each arm's runs; across tasks, the mean difference between arms, with a
// bootstrap interval over tasks and then runs. Only complete blocks count. Prints the
// report as Markdown.
//
//   node scripts/agent-benchmark/analyze.mjs --label <name> [--model <id>]
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readRecords, resultsDir } from "./records.mjs";
import { random } from "./tasks.mjs";

const RESAMPLES = 10_000;
const SEED = 20261025;

/** The margin by which success may be worse and the claim still hold. */
const MARGIN = -0.1;

/**
 * The claim's interval levels. Success is one test at 95%; cost and lines changed are two
 * chances for the claim to hold, so each is held to 97.5%, and the two together to 95%.
 */
const SUCCESS_LEVEL = 0.95;
const SAVING_LEVEL = 0.975;

/** A run succeeds only if the model finished on its own and the final tree passes every check. */
const succeeded = (record) =>
	record.result?.subtype === "success" && record.score?.success === true;

/** The measures compared between arms, over every run, failures included. */
export const MEASURES = {
	success: (record) => (succeeded(record) ? 1 : 0),
	cost: (record) => record.result?.costUsd ?? 0,
	linesChanged: (record) =>
		record.score ? record.score.diff.added + record.score.diff.removed : 0,
	linesChangedWithWhitespace: (record) =>
		record.score?.diff.withWhitespace
			? record.score.diff.withWhitespace.added + record.score.diff.withWhitespace.removed
			: undefined,
	turns: (record) => record.result?.turns ?? 0,
	toolCalls: (record) => record.toolCalls,
	lintRuns: (record) => record.lintRuns,
};

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

const blocksOf = (label) => {
	const dir = join(resultsDir, label);

	return existsSync(dir)
		? readdirSync(dir)
				.filter((name) => /^block-\d+$/.test(name))
				.map((name) => ({
					name,
					number: Number(name.slice("block-".length)),
					// A block that has no summary never got far enough to write one.
					summary: existsSync(join(dir, name, "block.json"))
						? JSON.parse(readFileSync(join(dir, name, "block.json"), "utf8"))
						: { complete: false },
				}))
				.toSorted((a, b) => a.number - b.number)
		: [];
};

/**
 * Every run in `label`'s complete blocks, the service's failures included, in a fixed
 * order, so the bootstrap draws the same samples on any machine.
 */
export function blockRecords(label) {
	return blocksOf(label)
		.filter(({ summary }) => summary.complete)
		.flatMap(({ name, number }) =>
			readRecords(label, name)
				.map((record) => ({ ...record, block: number }))
				.toSorted((a, b) => a.startedAt.localeCompare(b.startedAt)),
		);
}

/** The runs that count: the model's, from complete blocks. */
export const countedRecords = (label) =>
	blockRecords(label).filter((record) => record.outcome.kind === "model");

/** `records` grouped by task, then by arm, with tasks in name order. */
function byTask(records) {
	const tasks = new Map();

	for (const record of records.toSorted((a, b) => a.rule.localeCompare(b.rule))) {
		const arms = tasks.get(record.rule) ?? new Map();

		arms.set(record.arm, [...(arms.get(record.arm) ?? []), record]);

		tasks.set(record.rule, arms);
	}

	return tasks;
}

/**
 * The mean over tasks of `measure` under `treated` less under `control`, on the tasks that
 * have both, with its interval at `level`: tasks resampled, then each arm's runs within a
 * task. Undefined if no task has both, or the measure isn't recorded.
 */
export function difference(records, measure, treated, control, level = 0.95, seed = SEED) {
	const pairs = [...byTask(records).values()]
		.filter((arms) => arms.has(treated) && arms.has(control))
		.map((arms) => [arms.get(treated).map(measure), arms.get(control).map(measure)]);

	if (pairs.length === 0 || pairs.flat(2).some((value) => value === undefined)) {
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

	const tail = (1 - level) / 2;

	return {
		estimate,
		low: draws[Math.floor(RESAMPLES * tail)],
		high: draws[Math.ceil(RESAMPLES * (1 - tail)) - 1],
		level,
		tasks: pairs.length,
	};
}

/**
 * The pre-registered test of `treated` against `control`: success no worse by more than
 * 0.10, and cheaper per run or changing fewer lines.
 */
export function claim(records, treated, control) {
	const success = difference(records, MEASURES.success, treated, control, SUCCESS_LEVEL);
	const cost = difference(records, MEASURES.cost, treated, control, SAVING_LEVEL);
	const lines = difference(records, MEASURES.linesChanged, treated, control, SAVING_LEVEL);

	return {
		success,
		cost,
		lines,
		holds: success !== undefined && success.low >= MARGIN && (cost.high < 0 || lines.high < 0),
	};
}

/**
 * The pre-registered strategy decision. The simulation already chose guard if enough (C),
 * and eight tasks can't show it winning, so the benchmark only checks it does no harm: C
 * ships unless it is clearly worse than guard first (B), at 95%, on success, cost or lines
 * changed.
 */
export function strategy(records) {
	const success = difference(records, MEASURES.success, "C", "B");
	const cost = difference(records, MEASURES.cost, "C", "B");
	const lines = difference(records, MEASURES.linesChanged, "C", "B");

	const worse = [
		success?.high < 0 && "success",
		cost?.low > 0 && "cost",
		lines?.low > 0 && "lines changed",
	].filter(Boolean);

	return {
		success,
		cost,
		lines,
		worse,
		ships: success === undefined || worse.length > 0 ? "B" : "C",
	};
}

/**
 * A measure over successful runs only, which doesn't count towards any claim. A task
 * where either arm has no successful run is left out.
 */
function amongSuccesses(records, measure, treated, control) {
	const successful = records.filter(succeeded);
	const tasks = byTask(successful);

	const kept = successful.filter(
		(record) => tasks.get(record.rule).has(treated) && tasks.get(record.rule).has(control),
	);

	return difference(kept, measure, treated, control);
}

const format = (result, digits = 3) =>
	result
		? `${result.estimate.toFixed(digits)} [${result.low.toFixed(digits)}, ${result.high.toFixed(digits)}] (${Math.round(result.level * 100 * 10) / 10}%, ${result.tasks} tasks)`
		: "n/a";

/** One comparison's section: its claim, every measure, the successful-runs figures and the breakdown. */
function comparison(records, treated, control, title, verdict) {
	const lines = [
		`## ${title}: ${treated} against ${control}`,
		"",
		verdict,
		"",
		"| Measure | All runs | Successful runs only |",
		"| --- | --- | --- |",
		...Object.entries(MEASURES).map(
			([name, measure]) =>
				`| ${name} | ${format(difference(records, measure, treated, control))} | ${name === "success" ? "" : format(amongSuccesses(records, measure, treated, control))} |`,
		),
		"",
		"By the kind of the task's first hint, as a description:",
		"",
		"| First hint | Success | Cost | Lines changed |",
		"| --- | --- | --- | --- |",
	];

	for (const kind of [...new Set(records.map((record) => record.firstHint))].toSorted((a, b) =>
		a.localeCompare(b),
	)) {
		const subset = records.filter((record) => record.firstHint === kind);

		lines.push(
			`| ${kind} | ${["success", "cost", "linesChanged"].map((name) => format(difference(subset, MEASURES[name], treated, control))).join(" | ")} |`,
		);
	}

	return [...lines, ""];
}

function claimVerdict(records) {
	const result = claim(records, "B", "A");

	return `**The claim ${result.holds ? "holds" : "doesn't hold"}.** Success ${format(result.success)}; cost per run ${format(result.cost, 4)}; lines changed ${format(result.lines, 1)}.`;
}

function strategyVerdict(records) {
	const result = strategy(records);

	return `**${result.ships === "C" ? "Guard if enough ships" : "Guard first stays"}**${result.worse.length > 0 ? `: C is worse on ${result.worse.join(", ")}` : ": C is clearly worse on nothing"}. Success ${format(result.success)}; cost per run ${format(result.cost, 4)}; lines changed ${format(result.lines, 1)}.`;
}

/** The runs that didn't succeed, the re-runs, the cap hits and the cells with no run. */
function failures(all, counted, label) {
	const row = (record) =>
		`| ${record.block} | ${record.rule} | ${record.arm} | ${record.outcome.kind === "model" ? failureReason(record) : `${record.outcome.kind}: ${record.outcome.reason}`} |`;

	const failed = counted.filter((record) => !succeeded(record));
	const service = all.filter((record) => record.outcome.kind !== "model");
	const caps = counted.filter((record) => record.result?.subtype !== "success");
	const blocks = blocksOf(label);

	return [
		"## Every run that didn't count or didn't succeed",
		"",
		`${counted.length} counted runs in ${blocks.filter(({ summary }) => summary.complete).length} complete blocks; ${blocks.filter(({ summary }) => !summary.complete).length} incomplete blocks left out. ${caps.length} runs hit a cap.`,
		"",
		"| Block | Task | Arm | Reason |",
		"| --- | --- | --- | --- |",
		...[...failed, ...service].map(row),
		"",
		`Cells with no counted run in a block: ${blocks.flatMap(({ number, summary }) => (summary.missing ?? []).map((cell) => `${cell} (block ${number})`)).join(", ") || "none"}.`,
		"",
	];
}

function failureReason({ result, score }) {
	if (result?.subtype !== "success") {
		return result?.subtype ?? "no result";
	}

	const checks = [
		!score.reachedMax && `over the max (highest ${score.diff.highestScoreLeft ?? "unparsed"})`,
		!score.testsPassed && "tests fail",
		!score.integrity.ok &&
			`integrity (${[...score.integrity.outside, `${score.integrity.disableComments} directives`].join(", ")})`,
		score.integrity.ok && score.testsPassed && !score.behavior.same && "behavior differs",
	];

	return checks.filter(Boolean).join("; ");
}

export function report(label, model) {
	const all = blockRecords(label).filter((record) => !model || record.model === model);

	const tasks = JSON.parse(readFileSync(join(import.meta.dirname, "tasks.json"), "utf8"));

	const hints = new Map([...tasks.split, ...tasks.same].map((task) => [task.rule, task.firstHint]));
	const withHints = all.map((record) => ({ ...record, firstHint: hints.get(record.rule) }));
	const counted = withHints.filter((record) => record.outcome.kind === "model");
	const split = counted.filter((record) => tasks.split.some((task) => task.rule === record.rule));

	return [
		`# Agent benchmark: ${label}${model ? `, ${model}` : ""}`,
		"",
		...comparison(counted, "B", "A", "Primary", claimVerdict(counted)),
		...(split.some((record) => record.arm === "C")
			? comparison(split, "C", "B", "Strategy, split tasks", strategyVerdict(split))
			: []),
		...failures(withHints, counted, label),
	].join("\n");
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: { label: { type: "string" }, model: { type: "string" } },
	});

	console.log(report(values.label, values.model));
}

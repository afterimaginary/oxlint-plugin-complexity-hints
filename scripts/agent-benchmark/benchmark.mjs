// The agent benchmark's command line. See docs/designs/agent-benchmark.md.
//
//   node scripts/agent-benchmark/benchmark.mjs selftest
//     Scores scripted edits and classifies sample outcomes, with no model, to check both
//     catch what they should.
//   node scripts/agent-benchmark/benchmark.mjs check --label <name> --runs <rule>:<arm>,...
//       [--model <id>] [--effort <level>] [--max-turns <n>] [--max-budget <usd>]
//     Runs the listed task and arm pairs on the subscription, one at a time.
//   node scripts/agent-benchmark/benchmark.mjs counted --label <name> --model <id> --arms A,B
//       --tasks <n> --blocks <n> --funding subscription|api [--key-file <path> --budget <usd>]
//     Runs counted blocks; see "Running it" in the design.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { RULE, rewrite } from "../apply-hints.ts";
import { lint } from "../eval-repos.mjs";
import { bundleDir, prepare } from "./prepare.mjs";
import { counted } from "./counted.mjs";
import { findTask, keep, loadTasks, summarize } from "./records.mjs";
import { classify, initSnapshots, runAgent, scoreRun } from "./run-agent.mjs";
import { score, snapshotGit } from "./score.mjs";
import { createWorkspace, removeWorkspace } from "./workspace.mjs";

async function check(options) {
	await prepare();

	const tasks = loadTasks();

	for (const pair of options.runs.split(",")) {
		const [rule, arm] = pair.split(":");

		const task = findTask(tasks, rule);

		const outcome = await runAgent({
			task,
			arm,
			model: options.model,
			effort: options.effort,
			funding: "subscription",
			maxTurns: Number(options["max-turns"]),
			maxBudgetUsd: Number(options["max-budget"]),
			label: options.label,
		});

		scoreRun(outcome, task);

		console.log(summarize(outcome.record));

		keep(outcome.workspace, options.label);
	}
}

/** Scripted edits to a task's tree, each with the result the scoring should give. */
const EDITS = [
	{
		name: "no change",
		rule: "valid-typeof",
		edit: () => {},
		expect: { success: false, reachedMax: false },
	},
	{
		name: "disable comment",
		rule: "valid-typeof",
		edit: (work, task) =>
			replaceIn(
				work,
				task.file,
				"            UnaryExpression(node) {",
				"            // oxlint-disable-next-line complexity/cognitive-complexity\n            UnaryExpression(node) {",
			),
		expect: { success: false, reachedMax: true, integrity: false },
	},
	{
		name: "test file edited",
		rule: "valid-typeof",
		edit: (work, task) =>
			replaceIn(work, `tests/lib/rules/${task.rule}.js`, "valid: [", 'valid: [\n        "x",'),
		expect: { success: false, integrity: false },
	},
	{
		name: "behavior changed",
		rule: "valid-typeof",
		edit: (work, task) =>
			replaceIn(
				work,
				task.file,
				"if (!VALID_TYPES.has(value)) {",
				'if (!VALID_TYPES.has(value) && value !== "strnig") {',
			),
		expect: { success: false, behavior: false },
	},
	{
		name: "guard applied, still over the max",
		rule: "valid-typeof",
		edit: applyHint,
		expect: {
			success: false,
			reachedMax: false,
			testsPassed: true,
			behavior: true,
		},
	},
	{
		name: "guard applied, reaches the max",
		rule: "use-isnan",
		edit: applyHint,
		expect: { success: true },
	},
];

/** Run records, cut down to what `classify` reads, each with the outcome it should get. */
const RUN = {
	modelsSeen: { "claude-sonnet-5-5": 3 },
	result: { subtype: "success", text: "Done; one test timed out at first." },
};

const NO_REPLY = { "<synthetic>": 1 };

const OUTCOMES = [
	{ name: "the model finished", record: RUN, expect: "model" },
	{
		name: "the model ran out of turns",
		record: {
			...RUN,
			result: { subtype: "error_max_turns" },
			thrown: "Error: Reached maximum number of turns (100)",
		},
		expect: "model",
	},
	{
		name: "a key the API rejects",
		record: {
			modelsSeen: NO_REPLY,
			result: {
				subtype: "success",
				text: "API Error: 400 This API key is not scoped to a workspace",
			},
		},
		expect: "stop",
	},
	{
		name: "no credit left",
		record: {
			modelsSeen: NO_REPLY,
			result: { subtype: "success", text: "Credit balance is too low" },
		},
		expect: "stop",
	},
	{
		name: "rate limited",
		record: {
			modelsSeen: NO_REPLY,
			result: { subtype: "success", text: "API Error: 429 rate limited" },
		},
		expect: "infrastructure",
	},
	{
		name: "overloaded mid-run",
		record: {
			modelsSeen: { ...RUN.modelsSeen, ...NO_REPLY },
			result: { subtype: "success", text: "API Error: 529 Overloaded" },
		},
		expect: "infrastructure",
	},
	{
		name: "the session crashed",
		record: { ...RUN, result: { subtype: "error_during_execution" } },
		expect: "infrastructure",
	},
	{
		name: "a refusal",
		record: { ...RUN, result: { subtype: "success", stopReason: "refusal" } },
		expect: "infrastructure",
	},
	{
		name: "no result at all",
		record: { modelsSeen: {}, thrown: "Error: socket hang up" },
		expect: "infrastructure",
	},
];

function replaceIn(work, file, from, to) {
	const path = join(work, file);
	const text = readFileSync(path, "utf8");

	if (!text.includes(from)) {
		throw new Error(`${from} isn't in ${file}`);
	}

	writeFileSync(path, text.replace(from, to));
}

/** The task's own hint, applied mechanically, the way the hint evaluation does. */
function applyHint(work, task) {
	const report = lint(work, [task.file], { max: 15, plugin: join(bundleDir, "B.mjs") });
	const diagnostic = report.diagnostics.find(({ code }) => code === RULE);
	const path = join(work, task.file);
	const rewritten = rewrite(readFileSync(path, "utf8"), diagnostic);

	if (!rewritten || !("text" in rewritten)) {
		throw new Error(`The hint for ${task.rule} couldn't be applied: ${rewritten?.outcome}`);
	}

	writeFileSync(path, rewritten.text);
}

async function selftest() {
	await prepare();

	const tasks = loadTasks();
	let failures = 0;

	for (const { name, rule, edit, expect } of EDITS) {
		const task = findTask(tasks, rule);
		const workspace = createWorkspace("B");

		try {
			// The same snapshots a run keeps, with the edit as its only step.
			initSnapshots(workspace);

			edit(workspace.work, task);

			snapshotGit(workspace, ["add", "-A"]);

			snapshotGit(workspace, ["commit", "-q", "--allow-empty", "-m", "edit"]);

			const result = score(workspace, task);

			const actual = {
				success: result.success,
				reachedMax: result.reachedMax,
				testsPassed: result.testsPassed,
				integrity: result.integrity.ok,
				behavior: result.behavior.same,
			};

			const wrong = Object.entries(expect).filter(([key, value]) => actual[key] !== value);

			failures += wrong.length > 0 ? 1 : 0;

			console.log(`${wrong.length === 0 ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(actual)}`);
		} finally {
			removeWorkspace(workspace);
		}
	}

	for (const { name, record, expect } of OUTCOMES) {
		const { kind } = classify(record);

		failures += kind === expect ? 0 : 1;

		console.log(`${kind === expect ? "ok  " : "FAIL"} ${name}: ${kind}`);
	}

	process.exitCode = failures > 0 ? 1 : 0;
}

const { positionals, values } = parseArgs({
	allowPositionals: true,
	options: {
		label: { type: "string", default: "check" },
		runs: { type: "string" },
		model: { type: "string", default: "claude-sonnet-5-5" },
		effort: { type: "string", default: "high" },
		"max-turns": { type: "string", default: "100" },
		"max-budget": { type: "string", default: "5" },
		arms: { type: "string", default: "A,B" },
		tasks: { type: "string" },
		blocks: { type: "string", default: "1" },
		funding: { type: "string", default: "subscription" },
		"key-file": { type: "string" },
		budget: { type: "string" },
		reserve: { type: "string", default: "10" },
		"max-utilization": { type: "string", default: "0.95" },
		concurrency: { type: "string", default: "3" },
		"estimate-from": { type: "string" },
	},
});

const commands = { selftest, check, counted };

await commands[positionals[0]](values);

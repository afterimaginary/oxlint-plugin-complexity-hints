// The agent benchmark's command line. See docs/designs/agent-benchmark.md.
//
//   node scripts/agent-benchmark/benchmark.mjs selftest
//     Scores scripted edits, with no model, to check the scoring catches what it should.
//   node scripts/agent-benchmark/benchmark.mjs check --label <name> --runs <rule>:<arm>,...
//       [--model <id>] [--effort <level>] [--max-turns <n>] [--max-budget <usd>]
//     Runs the listed task and arm pairs on the subscription, one at a time.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { RULE, rewrite } from "../apply-hints.ts";
import { lint } from "../eval-repos.mjs";
import { benchDir, bundleDir, prepare } from "./prepare.mjs";
import { initSnapshots, runAgent } from "./run-agent.mjs";
import { score, snapshotGit } from "./score.mjs";
import { TASKS_FILE } from "./tasks.mjs";
import { createWorkspace, removeWorkspace } from "./workspace.mjs";

export const resultsDir = join(benchDir, "results");

export function loadTasks() {
	const { split, same } = JSON.parse(readFileSync(TASKS_FILE, "utf8"));

	return [...split, ...same];
}

const findTask = (tasks, rule) => {
	const task = tasks.find((candidate) => candidate.rule === rule);

	if (!task) {
		throw new Error(`No task for ${rule}`);
	}

	return task;
};

/** One line per run, for the terminal. */
function summarize({ record }) {
	const { score: result, outcome } = record;
	const cost = record.result?.costUsd?.toFixed(3) ?? "?";

	const verdict = result
		? `${result.success ? "success" : "fail"} (max ${result.reachedMax}, tests ${result.testsPassed}, integrity ${result.integrity.ok}, behavior ${result.behavior.same}) left ${result.diff.highestScoreLeft}, +${result.diff.added}/-${result.diff.removed}`
		: outcome.reason;

	return `${record.rule} ${record.arm}: ${outcome.kind}, ${verdict}; ${record.result?.turns ?? "?"} turns, $${cost}`;
}

/** Keeps a run's records and drops its tree, which the snapshots can rebuild. */
function keep(workspace, label) {
	const dir = join(resultsDir, label, workspace.id);

	mkdirSync(dir, { recursive: true });

	cpSync(workspace.meta, dir, { recursive: true });

	removeWorkspace(workspace);

	return dir;
}

async function check(options) {
	await prepare();

	const tasks = loadTasks();

	for (const pair of options.runs.split(",")) {
		const [rule, arm] = pair.split(":");

		const outcome = await runAgent({
			task: findTask(tasks, rule),
			arm,
			model: options.model,
			effort: options.effort,
			funding: "subscription",
			maxTurns: Number(options["max-turns"]),
			maxBudgetUsd: Number(options["max-budget"]),
			label: options.label,
		});

		console.log(summarize(outcome));

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
	},
});

const commands = { selftest, check };

await commands[positionals[0]](values);

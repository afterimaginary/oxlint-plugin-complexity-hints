// Counted runs, in blocks: each block is one run of every task and arm, in an order
// shuffled with a fixed seed. Before each block the runner checks that the block fits
// what's left, so a stop always falls at the end of a block and every cell has the same
// number of runs. See "Running it" in docs/designs/agent-benchmark.md.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { prepare, sha256 } from "./prepare.mjs";
import { keep, loadTasks, readRecords, resultsDir, summarize } from "./records.mjs";
import { runAgent, scoreRun } from "./run-agent.mjs";
import { random, shuffle } from "./tasks.mjs";

/** Leaves room for the block's runs costing more than the runs so far did. */
const MARGIN = 1.25;

/** Every task and arm in the benchmark; arm C runs only where its hint differs from B's. */
function cellsOf(tasks, arms) {
	return tasks.flatMap((task) =>
		arms.filter((arm) => arm !== "C" || task.split).map((arm) => ({ task, arm })),
	);
}

function blockNumbers(label) {
	const dir = join(resultsDir, label);

	return existsSync(dir)
		? readdirSync(dir)
				.filter((name) => /^block-\d+$/.test(name))
				.map((name) => Number(name.slice("block-".length)))
		: [];
}

/** Whether the next block fits, and why not. */
function fits({ funding, budget, reserve, maxUtilization, estimateFrom }, label, size) {
	const records = readRecords(label);

	// Before the first block, the cost per run comes from the check runs, at the same prices.
	const sample = records.length > 0 ? records : readRecords(estimateFrom);

	if (funding === "api") {
		const spent = records.reduce((sum, record) => sum + (record.result?.costUsd ?? 0), 0);
		const sampled = sample.reduce((sum, record) => sum + (record.result?.costUsd ?? 0), 0);
		const mean = sample.length > 0 ? sampled / sample.length : undefined;

		if (mean === undefined) {
			return {
				ok: false,
				why: "no runs yet to estimate a block's cost; run the first block with --budget set high enough for it",
			};
		}

		const needed = mean * size * MARGIN;

		return {
			ok: spent + needed <= budget - reserve,
			why: `$${spent.toFixed(2)} spent, the block needs about $${needed.toFixed(2)}, the budget is $${budget} less $${reserve} held back`,
		};
	}

	// On the subscription, the service reports how much of the week is used.
	const latest = sample
		.flatMap((record) => record.rateLimits ?? [])
		.filter(({ rateLimitType }) => rateLimitType === "seven_day")
		.at(-1);

	return {
		ok: !latest || latest.utilization < maxUtilization,
		why: `weekly usage ${latest ? Math.round(latest.utilization * 100) : "?"}%, stopping at ${Math.round(maxUtilization * 100)}%`,
	};
}

/** Runs `jobs` with at most `limit` at a time. */
async function pool(jobs, limit) {
	const results = [];
	let next = 0;

	const worker = async () => {
		while (next < jobs.length) {
			const index = next++;

			results[index] = await jobs[index]();
		}
	};

	await Promise.all(Array.from({ length: limit }, worker));

	return results;
}

export async function counted(options) {
	const provenance = await prepare();

	const tasks = loadTasks().slice(0, Number(options.tasks));
	const cells = cellsOf(tasks, options.arms.split(","));

	const apiKey =
		options.funding === "api" ? readFileSync(options["key-file"], "utf8").trim() : undefined;

	const settings = {
		funding: options.funding,
		budget: Number(options.budget),
		reserve: Number(options.reserve),
		maxUtilization: Number(options["max-utilization"]),
		estimateFrom: options["estimate-from"] ?? options.label,
	};

	const first = Math.max(0, ...blockNumbers(options.label)) + 1;
	/** @type {string | undefined} Why the account can't run more, once it can't. */
	let stopped;

	for (let block = first; block < first + Number(options.blocks) && !stopped; block++) {
		const check = fits(settings, options.label, cells.length);

		if (!check.ok) {
			console.log(`Not starting block ${block}: ${check.why}`);

			break;
		}

		const seed = parseInt(sha256(`${options.label} ${block}`).slice(0, 8), 16);
		const order = shuffle(cells, random(seed));
		const folder = [options.label, `block-${block}`];

		console.log(`Block ${block}: ${order.length} runs. ${check.why}`);

		const attempt = ({ task, arm }) =>
			runAgent({
				task,
				arm,
				model: options.model,
				effort: options.effort,
				funding: options.funding,
				apiKey,
				maxTurns: Number(options["max-turns"]),
				maxBudgetUsd: Number(options["max-budget"]),
				label: options.label,
			});

		const finished = await pool(
			order.map((cell) => async () => {
				if (stopped) {
					return [];
				}

				const runs = [await attempt(cell)];

				// A service failure is run once more with the same settings; both are kept.
				if (runs[0].record.outcome.kind === "infrastructure") {
					runs.push(await attempt(cell));
				}

				if (
					runs.some(
						({ record }) => record.outcome.kind === "stop" || record.outcome.kind === "aborted",
					)
				) {
					stopped = runs.at(-1).record.outcome.reason;
				}

				return runs.map((run) => ({ ...run, task: cell.task }));
			}),
			Number(options.concurrency),
		);

		for (const run of finished.flat()) {
			scoreRun(run, run.task);

			console.log(summarize(run.record));

			keep(run.workspace, ...folder);
		}

		writeFileSync(
			join(resultsDir, ...folder, "block.json"),
			JSON.stringify(
				{
					block,
					seed,
					complete: !stopped,
					provenance,
					order: order.map(({ task, arm }) => `${task.rule}:${arm}`),
				},
				null,
				"\t",
			),
		);

		if (stopped) {
			console.log(
				`Stopped in block ${block}: ${stopped}. The block is incomplete and isn't counted.`,
			);
		}
	}
}

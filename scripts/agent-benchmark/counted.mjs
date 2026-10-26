// Counted runs, in blocks: each block is one run of every task and arm, in an order
// shuffled with a fixed seed. Before each block the runner checks that the block fits
// what's left, so a stop always falls at the end of a block. Runs go one at a time, so
// they can't see or slow each other. See "Running it" in docs/designs/agent-benchmark.md.
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	realpathSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
	bundleHashes,
	PLUGIN_PATH,
	prepare,
	provenance as provenanceOf,
	sha256,
} from "./prepare.mjs";
import { keep, loadTasks, readRecords, resultsDir, summarize } from "./records.mjs";
import { leaks, runAgent, scoreRun } from "./run-agent.mjs";
import { random, shuffle, TASKS_FILE } from "./tasks.mjs";

/** The settings every counted run uses, fixed by the protocol rather than the command line. */
export const PROTOCOL = { effort: "high", maxTurns: 25, maxBudgetUsd: 0.5 };

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
function fits({ funding, budget, reserve, maxUtilization, estimateFrom, model }, label, size) {
	// Only runs the model took part in say what a run costs; a failed request costs nothing.
	const modelRuns = (folder) =>
		readRecords(folder).filter(
			(record) => record.outcome.kind === "model" && record.model === model,
		);

	const records = modelRuns(label);

	// Before the first block, the cost per run comes from the check runs, at the same prices.
	const sample = records.length > 0 ? records : estimateFrom ? modelRuns(estimateFrom) : [];

	if (funding === "api") {
		if (sample.length === 0) {
			return {
				ok: false,
				why: "no runs yet to estimate a block's cost; pass --estimate-from with the label of runs at the same settings",
			};
		}

		// Spending counts every run, the service's failures included.
		const spent = readRecords(label).reduce(
			(sum, record) => sum + (record.result?.costUsd ?? 0),
			0,
		);

		const mean =
			sample.reduce((sum, record) => sum + (record.result?.costUsd ?? 0), 0) / sample.length;

		const needed = mean * size * MARGIN;

		return {
			ok: spent + needed <= budget - reserve,
			why: `$${spent.toFixed(2)} spent, the block needs about $${needed.toFixed(2)}, the budget is $${budget} less $${reserve} held back`,
		};
	}

	// On the subscription, the service reports how much of the week is used.
	const latest = sample
		.toSorted((a, b) => a.endedAt.localeCompare(b.endedAt))
		.flatMap((record) => record.rateLimits ?? [])
		.filter(({ rateLimitType }) => rateLimitType === "seven_day")
		.at(-1);

	return {
		ok: !latest || latest.utilization < maxUtilization,
		why: `weekly usage ${latest ? Math.round(latest.utilization * 100) : "?"}%, stopping at ${Math.round(maxUtilization * 100)}%`,
	};
}

const frozen = () => JSON.parse(readFileSync(TASKS_FILE, "utf8")).provenance;

/**
 * Throws unless the plugins and the harness are the ones the tasks were drawn with.
 * Checked before every run, so a rebuild or a branch switch mid-benchmark stops it.
 */
function checkFrozen(provenance = currentProvenance()) {
	if (JSON.stringify(provenance) !== JSON.stringify(frozen())) {
		throw new Error(
			`The plugins or the harness differ from the ones ${TASKS_FILE} was drawn with:\n${JSON.stringify({ now: provenance, frozen: frozen() }, null, 2)}`,
		);
	}
}

const currentProvenance = () => provenanceOf(bundleHashes());

/** Throws unless a run's tree holds its arm's frozen plugin. */
function checkPlugin(workspace, arm) {
	const hash = sha256(readFileSync(join(workspace.work, PLUGIN_PATH)));

	if (hash !== frozen().plugins[arm]) {
		throw new Error(`The run's plugin for arm ${arm} isn't the frozen one: ${hash}`);
	}
}

/** What every block under a label must share, so blocks that differ aren't pooled. */
const blockSettings = (summary) =>
	JSON.stringify({
		model: summary.model,
		arms: summary.arms,
		tasks: summary.tasks,
		effort: summary.effort,
		maxTurns: summary.maxTurns,
		maxBudgetUsd: summary.maxBudgetUsd,
		provenance: summary.provenance,
	});

/** The label's blocks so far, after checking they were all run like the one about to start. */
function existingBlocks(label, planned) {
	const blocks = blockNumbers(label).map((number) =>
		JSON.parse(readFileSync(join(resultsDir, label, `block-${number}`, "block.json"), "utf8")),
	);

	const different = blocks.filter((block) => blockSettings(block) !== blockSettings(planned));

	if (different.length > 0) {
		throw new Error(
			`Block ${different[0].block} of ${label} was run with other settings; use a new label:\n${blockSettings(different[0])}\nnow:\n${blockSettings(planned)}`,
		);
	}

	return blocks;
}

/** Reads the API key, which must be in a folder the sandbox denies the agent. */
function readKey(file) {
	const path = realpathSync(file);

	if (!path.startsWith(`${realpathSync(join(homedir(), ".config"))}/`)) {
		throw new Error(`Keep the key file under ~/.config, which the agent can't read: ${path}`);
	}

	return readFileSync(path, "utf8").trim();
}

/**
 * One cell's run, scored and kept: a service failure is run once more with the same
 * settings, and both are kept. Returns the runs' records, or throws on a harness error.
 */
async function runCell({ task, arm }, settings, folder) {
	const records = [];

	for (let attempt = 0; attempt < 2; attempt++) {
		checkFrozen();

		const run = await runAgent({ ...settings, task, arm });

		checkPlugin(run.workspace, arm);

		scoreRun(run, task);

		console.log(summarize(run.record));

		// A run whose records hold the key isn't kept, so they can't be published by mistake.
		if (run.record.keyLeaked || leaks(run.workspace, settings.apiKey)) {
			run.record.outcome = {
				kind: "aborted",
				reason: `the API key appears in the run's records, left in ${run.workspace.dir}`,
			};

			records.push(run.record);

			break;
		}

		keep(run.workspace, ...folder);

		records.push(run.record);

		if (run.record.outcome.kind !== "infrastructure") {
			break;
		}
	}

	return records;
}

export async function counted(options) {
	const provenance = await prepare();

	checkFrozen(provenance);

	const tasks = loadTasks().slice(0, options.tasks ? Number(options.tasks) : undefined);
	const cells = cellsOf(tasks, options.arms.split(","));

	const apiKey = options.funding === "api" ? readKey(options["key-file"]) : undefined;

	const limits = {
		funding: options.funding,
		budget: Number(options.budget),
		reserve: Number(options.reserve),
		maxUtilization: Number(options["max-utilization"]),
		estimateFrom: options["estimate-from"],
		model: options.model,
	};

	const settings = {
		model: options.model,
		funding: options.funding,
		apiKey,
		label: options.label,
		...PROTOCOL,
	};

	const planned = {
		model: options.model,
		arms: options.arms,
		tasks: tasks.length,
		...PROTOCOL,
		provenance,
	};

	const previous = existingBlocks(options.label, planned);
	const first = Math.max(0, ...previous.map(({ block }) => block)) + 1;

	// `--blocks` is how many complete blocks the label should end with.
	const wanted = Number(options.blocks) - previous.filter(({ complete }) => complete).length;

	/** @type {string | undefined} Why no more runs can go, once they can't. */
	let stopped;

	for (let block = first; block < first + wanted && !stopped; block++) {
		const check = fits(limits, options.label, cells.length);

		if (!check.ok) {
			console.log(`Not starting block ${block}: ${check.why}`);

			break;
		}

		const seed = parseInt(sha256(`${options.label} ${block}`).slice(0, 8), 16);
		const order = shuffle(cells, random(seed));
		const folder = [options.label, `block-${block}`];
		const file = join(resultsDir, ...folder, "block.json");

		const summary = {
			block,
			seed,
			complete: false,
			...planned,
			order: order.map(({ task, arm }) => `${task.rule}:${arm}`),
			missing: [],
		};

		// Written first, so a block that never finishes says so.
		keepBlock(file, summary);

		console.log(`Block ${block}: ${order.length} runs. ${check.why}`);

		stopped = await runBlock(order, settings, folder, summary);

		summary.complete = !stopped;

		summary.stopped = stopped;

		keepBlock(file, summary);

		if (stopped) {
			console.log(
				`Stopped in block ${block}: ${stopped}. The block is incomplete and isn't counted.`,
			);
		}
	}
}

/**
 * Runs a block's cells in order, noting in `summary` the cells left with no counted run.
 * Returns why the benchmark has to stop, if it does.
 */
async function runBlock(order, settings, folder, summary) {
	for (const cell of order) {
		const name = `${cell.task.rule}:${cell.arm}`;
		let records;

		try {
			records = await runCell(cell, settings, folder);
		} catch (error) {
			return `harness error in ${name}: ${error.stack ?? error}`;
		}

		const last = records.at(-1).outcome;

		if (last.kind === "stop" || last.kind === "aborted") {
			return last.reason;
		}

		// Both attempts were the service's, so the cell has no counted run in this block.
		if (last.kind !== "model") {
			summary.missing.push(name);
		}
	}

	return undefined;
}

function keepBlock(file, summary) {
	mkdirSync(dirname(file), { recursive: true });

	writeFileSync(file, `${JSON.stringify(summary, null, "\t")}\n`);
}

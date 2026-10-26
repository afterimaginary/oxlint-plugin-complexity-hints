// Plays the lint loop without an agent, to compare hint strategies: takes every function
// over the max in the pinned repositories (see scripts/eval-repos.mjs), applies its hint the
// way scripts/apply-hints.ts does, lints again, and repeats until the function and every
// function moved out of it are at or under the max, or one of them has no concrete hint.
// It does so once per strategy, with the rules in scripts/strategy-plugin.ts, and writes
// the comparison to docs/evaluation/strategies.md. Run by hand with
// `vp run simulate-hints`; like the hint evaluation, it is not part of `verify`.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, normalize } from "node:path";
import { RULE, check, kindOf, rewrite, scoreOf } from "./apply-hints.ts";
import { checkout, lint, repositories, root } from "./eval-repos.mjs";
import { STRATEGIES } from "./strategy-plugin.ts";

const MAX = 15;

/** Edits allowed per function; the loop always ends well before, so reaching it is reported. */
const CAP = 100;

const PLUGIN = join(root, "scripts/strategy-plugin.ts");

/** The prefix of each new function's name, numbered per copy. */
const NAME = "__hintSim";

const codeOf = (rule) => `complexity(${rule})`;

const nonBlank = (text) => text.split("\n").filter((line) => line.trim() !== "").length;

const spanOf = ({ labels }) => labels[0].span;

const sameSpot = (a, b) =>
	spanOf(a).line === spanOf(b).line && spanOf(a).column === spanOf(b).column;

const fixOf = (message) => message.slice(message.indexOf("; fix: ") + 7);

/** One over-max function, followed in a copy of its file of its own. */
function start(dir, diagnostic, index) {
	const { filename } = diagnostic;
	const copy = join(dirname(filename), `.hint-sim-${index}-${basename(filename)}`);
	const text = readFileSync(join(dir, filename), "utf8");

	writeFileSync(join(dir, copy), text);

	return {
		diagnostic,
		copy,
		original: text,
		text,
		// The function, under "", and each one moved out of it: the round it appeared in, and
		// the hints applied to it since.
		functions: new Map([["", { created: 0, hints: 0 }]]),
		steps: [],
		status: "running",
		reason: undefined,
		highest: undefined,
		pending: undefined,
	};
}

/** The reports for the function and the ones moved out of it, keyed as in `functions`. */
function lineageOf(followed, reports) {
	return reports.flatMap((report) => {
		if (sameSpot(report, followed.diagnostic)) {
			return [{ key: "", report }];
		}

		const name = /^Function '([^']+)' /.exec(report.message)?.[1];

		return name && followed.functions.has(name) ? [{ key: name, report }] : [];
	});
}

function fail(followed, reason) {
	followed.status = "failed";

	followed.reason = reason;
}

/** The last change, if any, checked against its promise. */
function lastChangeHeld(followed, reports, rule) {
	if (!followed.pending) {
		return reports.every(({ code }) => code === codeOf(rule)) || "doesn't parse";
	}

	const { diagnostic, rewritten, name } = followed.pending;
	const { outcome } = check(reports, diagnostic, rewritten, { rule: codeOf(rule), name });

	return outcome === "as promised" || outcome;
}

/** The over-max function to fix next: the highest scoring, then the first. */
function nextOf(lineage) {
	const score = ({ report }) => scoreOf(report.message);

	return lineage
		.filter((entry) => score(entry) > MAX)
		.sort((a, b) => score(b) - score(a) || spanOf(a.report).offset - spanOf(b.report).offset)[0];
}

/**
 * One round for a function still running: check the last change against `scores`, the
 * reports at max 0, then make the next from `hints`, the reports at the max.
 */
function advance(followed, { scores, hints }, rule) {
	const held = lastChangeHeld(followed, scores, rule);

	if (held !== true) {
		return fail(followed, held);
	}

	const lineage = lineageOf(followed, scores);

	followed.highest = Math.max(0, ...lineage.map(({ report }) => scoreOf(report.message)));

	const next = nextOf(lineage);

	if (!next) {
		followed.status = "done";

		return;
	}

	const { key } = next;
	const report = hints.find((hint) => sameSpot(hint, next.report));

	if (!report) {
		return fail(followed, "not reported at the max");
	}

	const kind = kindOf(report.message);
	const promised = Number(/this one drops to (\d+)/.exec(report.message)?.[1]);

	followed.steps.push({
		kind,
		key,
		fix: fixOf(report.message),
		promised,
	});

	if (kind === "fallback") {
		followed.status = "stuck";

		return;
	}

	if (followed.steps.length > CAP) {
		followed.status = "capped";

		return;
	}

	const name = `${NAME}${followed.functions.size}`;
	const rewritten = rewrite(followed.text, report, name);

	if (!rewritten || "outcome" in rewritten) {
		return fail(followed, rewritten?.outcome ?? "promises no score");
	}

	const fixed = followed.functions.get(key);

	fixed.hints += 1;

	// In the loop an agent runs, every over-max function is fixed in each round, so the new
	// function appears in the round its parent's hint was applied in, whatever order the
	// simulation applies them in.
	if (kind !== "guard") {
		followed.functions.set(name, { created: fixed.created + fixed.hints, hints: 0 });
	}

	followed.steps.at(-1).lines = rewritten.lines;

	followed.text = rewritten.text;

	followed.pending = { diagnostic: report, rewritten, name };
}

/** What following one function cost, once it stopped. */
function summarize(followed) {
	const applied = followed.steps.filter(({ lines }) => lines !== undefined);
	const sum = (steps) => steps.reduce((total, { lines }) => total + lines, 0);

	return {
		where: `${followed.diagnostic.filename}:${spanOf(followed.diagnostic).line}`,
		before: scoreOf(followed.diagnostic.message),
		status: followed.status,
		reason: followed.reason,
		steps: followed.steps,
		edits: applied.length,
		// Every over-max function is reported in each run, so a function moved out in round r
		// gets its own hints from round r + 1, alongside the one it came from.
		rounds: Math.max(...[...followed.functions.values()].map((f) => f.created + f.hints)),
		added: followed.functions.size - 1,
		moved: sum(applied.filter(({ kind }) => kind !== "guard")),
		touched: sum(applied),
		netLines: nonBlank(followed.text) - nonBlank(followed.original),
		highest: followed.highest,
	};
}

/** Every function in `diagnostics` followed to the end with one strategy's rule. */
function simulate(dir, diagnostics, { rule }) {
	const followed = diagnostics.map((diagnostic, index) => start(dir, diagnostic, index));

	try {
		for (;;) {
			const live = followed.filter(({ status }) => status === "running");

			if (live.length === 0) {
				break;
			}

			const paths = live.map(({ copy }) => copy);

			// Scores for every function, from a run at max 0, and the hints at the max, which a
			// strategy may take into account.
			const [scores, hints] = [0, MAX].map((max) => {
				const report = lint(dir, paths, { max, plugin: PLUGIN, rule });

				if (report.number_of_files !== paths.length) {
					throw new Error(`Oxlint linted ${report.number_of_files} of ${paths.length} copies`);
				}

				return Map.groupBy(report.diagnostics, ({ filename }) => normalize(filename));
			});

			for (const one of live) {
				const copy = normalize(one.copy);

				advance(one, { scores: scores.get(copy) ?? [], hints: hints.get(copy) ?? [] }, rule);

				writeFileSync(join(dir, one.copy), one.text);
			}
		}
	} finally {
		for (const { copy } of followed) {
			rmSync(join(dir, copy), { force: true });
		}
	}

	return followed.map(summarize);
}

/**
 * Where a strategy's run for one function first parts from guard first's, if it does.
 * Until guard first suggests a guard clause, every strategy suggests the same fix, so a
 * difference before that means the strategy rules aren't what they say.
 */
function divergence(guardFirst, other) {
	const length = Math.max(guardFirst.steps.length, other.steps.length);

	for (let index = 0; index < length; index += 1) {
		const [a, b] = [guardFirst.steps[index], other.steps[index]];

		if (a?.fix === b?.fix) {
			continue;
		}

		if (!a || !b || a.kind !== "guard" || b.kind === "guard" || b.kind === "fallback") {
			throw new Error(`${guardFirst.where}: the strategies differ at step ${index + 1}`);
		}

		return { index, guardReachesMax: a.promised <= MAX };
	}

	return undefined;
}

function evaluate(repository) {
	const dir = checkout(repository);

	// Oxlint's order varies between runs, so sort for a stable summary.
	const diagnostics = lint(dir, repository.paths, { max: MAX })
		.diagnostics.filter(({ code }) => code === RULE)
		.sort((a, b) => a.filename.localeCompare(b.filename) || spanOf(a).offset - spanOf(b).offset);

	const byStrategy = STRATEGIES.map((strategy) => simulate(dir, diagnostics, strategy));

	return diagnostics.map((_, index) => {
		const runs = byStrategy.map((followed) => followed[index]);

		return {
			repository: repository.name,
			runs,
			splits: runs.map((run) => divergence(runs[0], run)),
		};
	});
}

// Summary ----------------------------------------------------------------------------

const percentile = (values, q) => {
	const sorted = values.toSorted((a, b) => a - b);

	return sorted.length === 0 ? "–" : sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
};

const total = (values) => values.reduce((sum, value) => sum + value, 0);

const signed = (value) => (value > 0 ? `+${value}` : `${value}`);

const STATUSES = [
	["done", "at or under the max"],
	["stuck", "stuck: no concrete hint"],
	["failed", "rewrite failed (not counted)"],
	["capped", `stopped at ${CAP} edits`],
];

const titles = (strategies) => strategies.map(({ title }) => title).join(" | ");

const header = (first, strategies) => [
	`| ${first} | ${titles(strategies)} |`,
	`| --- | ${strategies.map(() => "--:").join(" | ")} |`,
];

function outcomeTable(functions) {
	return [
		...header("Outcome", STRATEGIES),
		...STATUSES.map(
			([status, label]) =>
				`| ${label} | ${STRATEGIES.map((_, side) => functions.filter(({ runs }) => runs[side].status === status).length).join(" | ")} |`,
		),
		`| **all** | ${STRATEGIES.map(() => functions.length).join(" | ")} |`,
	];
}

/** @type {[string, (runs: any[]) => string | number][]} */
const COSTS = [
	["Edits (hints applied), total", (runs) => total(runs.map((run) => run.edits))],
	["Edits, median / 90th percentile / max", (runs) => spread(runs.map((run) => run.edits))],
	["Lint rounds, total", (runs) => total(runs.map((run) => run.rounds))],
	["Lint rounds, median / 90th percentile / max", (runs) => spread(runs.map((run) => run.rounds))],
	["Functions added", (runs) => total(runs.map((run) => run.added))],
	["Lines moved into new functions", (runs) => total(runs.map((run) => run.moved))],
	[
		"Lines moved, including up a level out of a guard",
		(runs) => total(runs.map((run) => run.touched)),
	],
	["Net new lines", (runs) => signed(total(runs.map((run) => run.netLines)))],
	["Highest score left, median / max", (runs) => highestSpread(runs)],
];

function spread(values) {
	return `${percentile(values, 0.5)} / ${percentile(values, 0.9)} / ${percentile(values, 1)}`;
}

function highestSpread(runs) {
	const values = runs.map((run) => run.highest);

	return `${percentile(values, 0.5)} / ${percentile(values, 1)}`;
}

function costTable(functions) {
	return [
		...header(`Over ${functions.length} functions`, STRATEGIES),
		...COSTS.map(
			([label, measure]) =>
				`| ${label} | ${STRATEGIES.map((_, side) => measure(functions.map(({ runs }) => runs[side]))).join(" | ")} |`,
		),
	];
}

/** @type {[string, (run: any) => number][]} */
const MEASURES = [
	["Lint rounds", (run) => run.rounds],
	["Edits", (run) => run.edits],
	["Functions added", (run) => run.added],
	["Lines moved, including out of a guard", (run) => run.touched],
	["Highest score left", (run) => run.highest],
];

/** How many of `functions` have the strategy at `side` fewer, the same or more of `measure`. */
function comparison(functions, side, measure) {
	const deltas = functions.map(({ runs }) => measure(runs[side]) - measure(runs[0]));
	const count = (test) => deltas.filter(test).length;

	return `${count((delta) => delta < 0)} / ${count((delta) => delta === 0)} / ${count((delta) => delta > 0)}`;
}

function differenceTable(functions) {
	const others = STRATEGIES.slice(1);

	return [
		...header("Against guard first: fewer / same / more", others),
		...MEASURES.map(
			([label, measure]) =>
				`| ${label} | ${others.map((_, index) => comparison(functions, index + 1, measure)).join(" | ")} |`,
		),
	];
}

const runText = ({ status, edits, rounds, added, highest, reason }) =>
	status === "done"
		? `${edits} edits, ${rounds} rounds, ${added} added, ${highest} left`
		: `${status}${reason ? ` (${reason})` : ""} after ${edits} edits`;

function listing({ repository, runs }) {
	const each = STRATEGIES.map(({ title }, side) => `${title.toLowerCase()} ${runText(runs[side])}`);

	return `- ${repository} \`${runs[0].where}\`, ${runs[0].before}: ${each.join("; ")}`;
}

const allDone = ({ runs }) => runs.every(({ status }) => status === "done");

function differences(functions) {
	const split = functions.filter(({ splits }) => splits.some(Boolean));
	const finished = split.filter(allDone);

	const parts = STRATEGIES.slice(1).map(({ title }, index) => {
		const parted = split.filter(({ splits }) => splits[index + 1]);
		const enough = parted.filter(({ splits }) => splits[index + 1].guardReachesMax).length;

		return `- **${title}** parts from it on ${parted.length}, and on ${enough} of them passes over a guard clause that alone would have reached the max.`;
	});

	return [
		`The strategies part on ${split.length} of ${functions.length} functions, each time where guard first suggests a guard clause and another strategy a move:`,
		"",
		...parts,
		"",
		`Over the ${finished.length} of those that every strategy brings to the max:`,
		"",
		...(finished.length > 0
			? [...costTable(finished), "", ...differenceTable(finished)]
			: ["None."]),
	];
}

/**
 * Why the rule uses guard if enough (ADR-0005), with its numbers from the functions where
 * the strategies part and every strategy reaches the max. The wording assumes the
 * comparison it was written from, so it says when the numbers no longer support it.
 */
function recommendation(functions) {
	const finished = functions.filter(({ splits }) => splits.some(Boolean)).filter(allDone);
	const sideOf = (rule) => STRATEGIES.findIndex((strategy) => strategy.rule === rule);

	const [guardFirst, largestSaving, guardIfEnough] = [
		"guard-first",
		"largest-saving",
		"guard-if-enough",
	].map(sideOf);

	const of = (side, measure) => total(finished.map(({ runs }) => measure(runs[side])));
	const rounds = (run) => run.rounds;
	const added = (run) => run.added;
	const movedLines = (run) => run.moved;
	const fewer = finished.filter(({ runs }) => runs[guardIfEnough].rounds < runs[guardFirst].rounds);
	const more = finished.filter(({ runs }) => runs[guardIfEnough].rounds > runs[guardFirst].rounds);

	const highest = (side, test) =>
		finished.filter(({ runs }) => test(runs[side].highest - runs[guardFirst].highest)).length;

	const holds =
		more.length === 0 &&
		fewer.length > 0 &&
		of(guardIfEnough, rounds) <= of(largestSaving, rounds) &&
		of(guardIfEnough, (run) => run.edits) <= of(largestSaving, (run) => run.edits) &&
		of(guardFirst, movedLines) >= 0.9 * of(guardIfEnough, movedLines) &&
		of(guardIfEnough, added) < of(largestSaving, added) &&
		of(guardIfEnough, added) > of(guardFirst, added);

	if (!holds) {
		return "The numbers no longer support the strategy the rule uses (ADR-0005); it needs revisiting.";
	}

	return [
		`The rule uses guard if enough (ADR-0005). The [agent pilot](agent-pilot.md) gives no reason to keep suggesting a guard clause that isn't enough on its own: given one, agents extracted functions anyway. Where the strategies part, it reaches the max in fewer lint rounds than guard first on ${fewer.length} of ${finished.length} functions, and never in more: ${of(guardIfEnough, rounds)} rounds against ${of(guardFirst, rounds)}. Guard first still moves ${of(guardFirst, movedLines)} lines into new functions after its guard clauses, against ${of(guardIfEnough, movedLines)}, so suggesting the move straight away mostly saves the rounds the guard clauses took.`,
		"",
		`Against largest saving, it reaches the max in as few edits and lint rounds, and adds ${of(guardIfEnough, added)} functions to ${of(largestSaving, added)}, because it keeps the guard clause wherever the guard alone is enough. Whether that smaller change is also easier to review would take an agent benchmark on harder tasks than the pilot's (#53).`,
		"",
		`What it costs, against guard first over these ${finished.length}: ${of(guardIfEnough, added) - of(guardFirst, added)} more functions, and the moved code a reader follows into them. Its highest score left is higher than guard first's on ${highest(guardIfEnough, (delta) => delta > 0)} of them and lower on ${highest(guardIfEnough, (delta) => delta < 0)}, though at or under the max either way. The simulation can't weigh these against a round saved; an agent in the loop could, by how many tokens and steps it takes and how large its diff is, but the pilot's agents fixed every function in one pass.`,
	].join("\n");
}

function summary(results) {
	const functions = results.flat();
	const finished = functions.filter(allDone);

	const failed = functions.filter(({ runs }) =>
		runs.some(({ status }) => status !== "done" && status !== "stuck"),
	);

	return [
		"# Hint strategies, simulated",
		"",
		"How many rounds of the lint loop each hint strategy takes to bring a function to the max, and what it adds along the way. `scripts/simulate-hints.mjs` takes every function over the default max of 15 in the repositories of the [hint evaluation](hints.md). It plays the loop without an agent: it applies the function's hint mechanically, as the hint evaluation does, lints again, and repeats. It stops when the function and every function moved out of it are at or under the max, or one of them has no concrete hint. Each function is followed in a copy of its file of its own, and each step is checked against the scores its hint promised.",
		"",
		"This measures what it costs to reach the max, not how reviewable the result is: a change that moves code is harder to review than one that doesn't, which the line counts below only approximate.",
		"",
		"## Strategies",
		"",
		"Each strategy decides between the guard clause the rule finds and the best region to move, when both help. The rule finds at most one guard clause, around the deepest increment, so the strategies compare that guard against every move, not every possible guard.",
		"",
		"- **Guard first**: the guard clause.",
		"- **Largest saving**: whichever leaves the lower highest score; a tie goes to the guard clause, which moves no code.",
		"- **Guard if enough**, what the rule does: the guard clause when it brings the function to the max, or else as largest saving.",
		"",
		"A strategy that adds how far over the max the function still is would pick the same fix as largest saving, differing only in wording. A mechanical loop doesn't read the wording, so only an agent could tell them apart; the [agent pilot](agent-pilot.md) didn't test it.",
		"",
		"## Outcomes",
		"",
		...outcomeTable(functions),
		"",
		"## Cost of reaching the max",
		"",
		`Over the ${finished.length} functions that every strategy brings to the max:`,
		"",
		...costTable(finished),
		"",
		"- **Edits** count hints applied, one at a time, to the highest-scoring function still over the max.",
		"- **Lint rounds** count runs of the linter an agent would see. Every function over the max is reported in each run, so a function moved out in one round gets its own fix in the next, alongside the one it came from. Each function's hints are taken to depend only on its own code, which holds unless a move hands variables back and forth between them.",
		"- **Lines moved** count every line of each region moved into a new function, blank ones included, and, in the second row, the lines a guard clause's body moves up a level as well, which a formatter re-indents.",
		"- **Net new lines** count non-blank lines added, as the rewrites lay them out: a call and its workaround where the region was, and the new function's first and last lines.",
		"",
		"## Where the strategies differ",
		"",
		...differences(functions),
		"",
		"## The strategy the rule uses",
		"",
		recommendation(functions),
		"",
		"## Not counted",
		"",
		failed.length > 0
			? "A rewrite that doesn't parse or doesn't reach its promised scores is a failure of the rewrites, not of a strategy, so the function is left out of every strategy's costs:"
			: "No rewrite failed to parse or to reach its promised scores.",
		"",
		...failed.map(listing),
		"",
		"## Every function where the strategies differ",
		"",
		...functions.filter(({ splits }) => splits.some(Boolean)).map(listing),
		"",
	].join("\n");
}

const results = repositories.map(evaluate);
const output = join(root, "docs/evaluation/strategies.md");

mkdirSync(dirname(output), { recursive: true });

writeFileSync(output, summary(results));

// Picks the agent benchmark's tasks: functions in ESLint's lib/rules/ over the max, where
// the rule's own tests pass and would notice the function doing nothing, and the
// function is the only one over the max in its file. Writes
// scripts/agent-benchmark/tasks.json in the order tasks are run and cut. No model is
// involved. See docs/designs/agent-benchmark.md.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RULE, kindOf, reportedBody, scoreOf } from "../apply-hints.ts";
import { lint, root, run } from "../eval-repos.mjs";
import { ARMS } from "./arm-plugin.ts";
import { baseDir, bundleDir, prepare, SCORING_ENV } from "./prepare.mjs";
import { createWorkspace, removeWorkspace } from "./workspace.mjs";

export const TASKS_FILE = join(root, "scripts/agent-benchmark/tasks.json");

/** Fixed before any run, so the draw order can't be chosen after seeing results. */
const SEED = 20261025;

const BANDS = [
	{ band: "16-20", lowest: 16 },
	{ band: "21-30", lowest: 21 },
	{ band: "over 30", lowest: 31 },
];

const bandOf = (score) => BANDS.findLast(({ lowest }) => score >= lowest).band;

/** A small seeded generator (mulberry32), so the draw is the same on every machine. */
export function random(seed) {
	let state = seed;

	return () => {
		state = (state + 0x6d2b79f5) | 0;

		let t = Math.imul(state ^ (state >>> 15), 1 | state);

		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function shuffle(items, next) {
	const shuffled = [...items];

	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(next() * (i + 1));

		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}

	return shuffled;
}

/** Bands shuffled on their own and taken in turn, so any prefix keeps the mix of scores. */
function interleave(tasks, next) {
	const queues = BANDS.map(({ band }) =>
		shuffle(
			tasks.filter((task) => task.band === band),
			next,
		),
	);

	const order = [];

	while (queues.some((queue) => queue.length > 0)) {
		for (const queue of queues) {
			if (queue.length > 0) {
				order.push(queue.shift());
			}
		}
	}

	return order;
}

export const testFile = (rule) => `tests/lib/rules/${rule}.js`;

/** Long enough for any rule's tests, which take seconds; a rule left looping fails. */
const TEST_TIMEOUT = 5 * 60_000;

/** The rule's own tests in `dir`: whether they pass, and mocha's summary. */
export function runTests(dir, rule) {
	try {
		const result = run(
			process.execPath,
			["node_modules/mocha/bin/mocha", "--reporter", "dot", testFile(rule)],
			dir,
			{ timeout: TEST_TIMEOUT, env: SCORING_ENV },
		);

		return { passed: result.status === 0, output: (result.stdout + result.stderr).slice(-2000) };
	} catch (error) {
		return { passed: false, output: `${error.code ?? error}: the tests didn't finish` };
	}
}

/** Over-max diagnostics in lib/rules/, by file, for every arm. */
function diagnosticsByArm(files) {
	return Object.fromEntries(
		ARMS.map(({ arm }) => {
			const report = lint(baseDir, files, { max: 15, plugin: join(bundleDir, `${arm}.mjs`) });

			return [arm, report.diagnostics.filter(({ code }) => code === RULE)];
		}),
	);
}

/** Does the rule's test file fail when the reported function's body is emptied? */
function testsNotice(work, file, diagnostic, rule) {
	const path = join(work, file);
	const source = readFileSync(path, "utf8");
	const body = reportedBody(source, { ...diagnostic, filename: file });

	if (!body) {
		throw new Error(
			`Couldn't find the function reported at ${file}:${diagnostic.labels[0].span.line}`,
		);
	}

	const empty = source[body[0]] === "{" ? "{}" : "(undefined)";

	writeFileSync(path, source.slice(0, body[0]) + empty + source.slice(body[1]));

	const { passed } = runTests(work, rule);

	writeFileSync(path, source);

	return !passed;
}

async function main() {
	const provenance = await prepare();

	const files = readdirSync(join(baseDir, "lib/rules"))
		.filter((name) => name.endsWith(".js"))
		.map((name) => `lib/rules/${name}`);

	const byArm = diagnosticsByArm(files);
	const work = createWorkspace("B");
	const qualified = [];
	const excluded = [];

	try {
		for (const file of files) {
			const rule = file.slice("lib/rules/".length, -".js".length);
			const reported = byArm.B.filter(({ filename }) => filename === file);

			if (reported.length === 0) {
				continue;
			}

			const [diagnostic] = reported;
			const line = diagnostic.labels[0].span.line;
			const why = (reason) => excluded.push({ file, line, reason });

			if (reported.length > 1) {
				why(`${reported.length} functions over the max`);

				continue;
			}

			const others = Object.fromEntries(
				ARMS.map(({ arm }) => [arm, byArm[arm].filter(({ filename }) => filename === file)]),
			);

			if (
				Object.values(others).some(
					(list) => list.length !== 1 || list[0].labels[0].span.line !== line,
				)
			) {
				throw new Error(`The arms don't report the same function in ${file}`);
			}

			if (!readdirSync(join(baseDir, "tests/lib/rules")).includes(`${rule}.js`)) {
				why("no test file of its own");

				continue;
			}

			if (!runTests(work.work, rule).passed) {
				why("its tests fail before any change");

				continue;
			}

			if (!testsNotice(work.work, file, diagnostic, rule)) {
				why("its tests pass with the function's body emptied");

				continue;
			}

			const hint = (arm) => /; fix: (.*)$/.exec(others[arm][0].message)[1];
			const score = scoreOf(diagnostic.message);

			qualified.push({
				rule,
				file,
				line,
				label: /^(.*) has cognitive complexity/.exec(diagnostic.message)[1],
				score,
				band: bandOf(score),
				firstHint: kindOf(diagnostic.message),
				split: hint("B") !== hint("C"),
				messages: Object.fromEntries(ARMS.map(({ arm }) => [arm, others[arm][0].message])),
			});
		}
	} finally {
		removeWorkspace(work);
	}

	const next = random(SEED);

	const split = shuffle(
		qualified.filter((task) => task.split),
		next,
	);

	const same = interleave(
		qualified.filter((task) => !task.split),
		next,
	);

	writeFileSync(
		TASKS_FILE,
		`${JSON.stringify(
			{
				seed: SEED,
				provenance,
				split,
				same,
				excluded,
			},
			null,
			"\t",
		)}\n`,
	);

	console.log(
		`${split.length} split tasks, ${same.length} same-hint tasks, ${excluded.length} excluded`,
	);
}

if (import.meta.main) {
	await main();
}

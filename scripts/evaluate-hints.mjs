// Runs the rule over pinned open-source repositories, records every fix hint, and applies
// each one that makes a promise (see scripts/apply-hints.ts) to check that the scores
// drop to what it states. Writes the summary to docs/evaluation/hints.md. Run by hand
// with `vp run evaluate-hints`; it is not part of `verify`, since it needs the network and
// its numbers move with the rule.
//
// The repositories are fetched at their pinned commits into HINT_EVAL_DIR, or a folder in
// the system temp directory, never into this repository.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RULE, applyAll, hasObstacle, kindOf, scoreOf } from "./apply-hints.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const cache = process.env.HINT_EVAL_DIR ?? join(tmpdir(), "complexity-hint-eval");

const repositories = [
	{
		name: "ESLint",
		url: "https://github.com/eslint/eslint",
		tag: "v9.0.0",
		commit: "e0cbc50179adac1670f4e0bd9093387a51f4f42a",
		paths: ["lib"],
	},
	{
		name: "Prettier",
		url: "https://github.com/prettier/prettier",
		tag: "3.0.0",
		commit: "186e0966b010d57a0be1185494ce772becf5dac4",
		paths: ["src"],
	},
	{
		name: "Vite",
		url: "https://github.com/vitejs/vite",
		tag: "v6.0.0",
		commit: "814120f2ad387ca3d1e16c7dd403b04ca4b97f75",
		paths: ["packages/vite/src"],
	},
	{
		name: "Excalidraw",
		url: "https://github.com/excalidraw/excalidraw",
		tag: "v0.17.0",
		commit: "ddb75850573f6fef9a0786ced32ae63ab913f0e0",
		paths: ["src"],
	},
];

// Vite+ sets `VP_VERSION`, which makes Oxlint read configs as Vite+ configs; `CI` and
// `FORCE_COLOR` add colors. None of them belong in a plain Oxlint run.
const { VP_VERSION: _vp, CI: _ci, FORCE_COLOR: _color, ...env } = process.env;

function run(command, args, cwd) {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		env,
		maxBuffer: 1 << 28,
	});

	if (result.error) {
		throw result.error;
	}

	return result;
}

/** The repository's checkout at its pinned commit, fetched if it isn't there yet. */
function checkout(repository) {
	const dir = join(cache, repository.name.toLowerCase());
	const head = existsSync(dir) ? run("git", ["rev-parse", "HEAD"], dir).stdout.trim() : "";

	if (head === repository.commit) {
		// A run that was stopped can leave a rewritten copy behind, which would be linted.
		run("git", ["clean", "-fdq"], dir);

		return dir;
	}

	rmSync(dir, { recursive: true, force: true });

	mkdirSync(dir, { recursive: true });

	run("git", ["init", "-q"], dir);

	for (const args of [
		["fetch", "-q", "--depth", "1", repository.url, repository.commit],
		["-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD"],
	]) {
		const step = run("git", args, dir);

		if (step.status !== 0) {
			throw new Error(`Couldn't check out ${repository.name}: ${step.stderr}`);
		}
	}

	return dir;
}

const configs = new Map();

/** A config with the rule from this repository's source at `max`, and nothing else on. */
function config(max) {
	if (!configs.has(max)) {
		const file = join(cache, `oxlintrc-${max}.json`);

		writeFileSync(
			file,
			JSON.stringify({
				jsPlugins: [{ name: "complexity", specifier: join(root, "src/index.ts") }],
				categories: { correctness: "off" },
				rules: { "complexity/cognitive-complexity": ["error", max] },
			}),
		);

		configs.set(max, file);
	}

	return configs.get(max);
}

/** Oxlint's JSON report for `paths` in `dir`. */
function lint(dir, paths, max) {
	const result = run(
		join(root, "node_modules/.bin/oxlint"),
		["-c", config(max), "--format", "json", ...paths],
		dir,
	);

	if (!result.stdout.startsWith("{")) {
		throw new Error(result.stdout + result.stderr);
	}

	return JSON.parse(result.stdout);
}

/** Everything the summary needs about one repository. */
function evaluate(repository) {
	const dir = checkout(repository);
	const report = lint(dir, repository.paths, 15);

	// Oxlint's order varies between runs, so sort for a stable summary.
	const diagnostics = report.diagnostics
		.filter(({ code }) => code === RULE)
		.sort(
			(a, b) =>
				a.filename.localeCompare(b.filename) || a.labels[0].span.offset - b.labels[0].span.offset,
		);

	const kinds = Map.groupBy(diagnostics, ({ message }) => kindOf(message));

	const applied = applyAll(dir, diagnostics, (paths) => {
		const copies = lint(dir, paths, 0);

		if (copies.number_of_files !== paths.length) {
			throw new Error(`Oxlint linted ${copies.number_of_files} of ${paths.length} copies`);
		}

		return copies;
	}).map((result) => ({ ...result, where: whereOf(result.diagnostic) }));

	return {
		...repository,
		files: report.number_of_files,
		diagnostics,
		count: (kind) => kinds.get(kind)?.length ?? 0,
		obstacles: (kinds.get("move") ?? []).filter(({ message }) => hasObstacle(message)).length,
		applied,
	};
}

const whereOf = ({ filename, labels }) => `${filename}:${labels[0].span.line}`;

const percent = (part, whole) => (whole === 0 ? "–" : `${Math.round((part / whole) * 100)}%`);

const KINDS = [
	["guard", "Guard clause"],
	["move", "Move"],
	["helper", "Helper for a `?:`"],
];

const OUTCOMES = [
	"as promised",
	"lower, not as promised",
	"not lower",
	"doesn't parse",
	"wrong exit",
	"not applied",
	"return not named",
	"not reported",
	"not found",
];

/** `17`, or `11 and 12` for a move: the scores a fix reached, or `?` where there are none. */
function scores({ after, moved }) {
	if (after === undefined) {
		return "?";
	}

	return moved === undefined ? `${after}` : `${after} and ${moved}`;
}

const promisedScores = ({ promised }) =>
	scores({ after: promised.remaining, moved: promised.moved });

/** One line per diagnostic in a repository: where, which function, its score and its hint. */
function listing({ name, diagnostics, applied }) {
	const results = new Map(applied.map((result) => [result.where, result]));

	const lines = diagnostics.map((diagnostic) => {
		const { message } = diagnostic;
		const where = whereOf(diagnostic);
		const label = message.slice(0, message.indexOf(" has cognitive complexity"));
		const result = results.get(where);
		const outcome = result ? `: ${result.outcome}, to ${scores(result)}` : "";

		return `- \`${where}\` ${label}, ${scoreOf(message)}, ${kindOf(message)}${outcome}`;
	});

	return [
		`<details><summary>${name}: ${diagnostics.length}</summary>`,
		"",
		...lines,
		"",
		"</details>",
		"",
	];
}

/** How much each kind of fix saved: for a move, down to the higher of the two scores. */
function savingsLine(applied, [kind, title]) {
	const savings = applied
		.filter((result) => result.kind === kind && result.outcome === "as promised")
		.map(({ before, after, moved }) => before - Math.max(after, moved ?? 0));

	if (savings.length === 0) {
		return [];
	}

	const average = savings.reduce((a, b) => a + b, 0) / savings.length;

	return [
		`- ${title}: ${Math.min(...savings)} to ${Math.max(...savings)} points, ${average.toFixed(1)} on average.`,
	];
}

/** The fixes applied, by outcome and kind of fix. */
function outcomesTable(applied) {
	const of = (kind) => applied.filter((result) => result.kind === kind);

	return [
		`| Outcome | ${KINDS.map(([, title]) => title).join(" | ")} | Share |`,
		`| --- | ${KINDS.map(() => "--:").join(" | ")} | --: |`,
		...OUTCOMES.map((outcome) => {
			const counts = KINDS.map(([kind]) => of(kind).filter((r) => r.outcome === outcome).length);
			const total = counts.reduce((a, b) => a + b, 0);

			return `| ${outcome} | ${counts.join(" | ")} | ${percent(total, applied.length)} |`;
		}),
		`| **all** | ${KINDS.map(([kind]) => of(kind).length).join(" | ")} | |`,
	];
}

/** The summary page, in Markdown. */
function summary(results) {
	const applied = results.flatMap(({ name, applied }) =>
		applied.map((result) => ({ name, ...result })),
	);

	const misses = applied.filter(({ outcome }) => outcome !== "as promised");

	const examples = ["guard", "move", "helper", "fallback"].map((kind) => [
		kind,
		results
			.flatMap(({ name, diagnostics }) =>
				diagnostics.map((diagnostic) => ({ name, ...diagnostic })),
			)
			.find(({ message }) => kindOf(message) === kind),
	]);

	return [
		"# Hint evaluation",
		"",
		"How the rule's fix hints do on real code. `scripts/evaluate-hints.mjs` runs the rule at the default max of 15 over the repositories below, at pinned commits, and records the hint in every diagnostic. Each hint that promises a score is then applied mechanically, as `scripts/apply-hints.ts` describes, and the code is scored again:",
		"",
		"- **Guard clause:** the `if` becomes `if (!(test)) return;` or `continue;`, and its body moves up a level.",
		"- **Move:** the region becomes a function declared inside the reported function, and a call takes its place, with the workaround each obstacle names: the call's result returned, or checked with an `if` that returns, breaks or continues, or assigned to the names it hands back, declared first where the hint says. The rule scores a nested function on its own, so both promised scores can be read off the result.",
		"- **Helper for a `?:`:** the `?:` becomes a call to a helper that returns it.",
		"",
		"`tests/hint-promises.test.ts` does the same for the CLI fixtures, which cover every kind of fix and every obstacle clause, as part of `verify`.",
		"",
		"Generated by `vp run evaluate-hints`, and refreshed by hand when the hints change; not part of `verify`.",
		"",
		"## Diagnostics",
		"",
		"| Repository | Version | Linted | Files | Over max | Guard clause | Move | Move with obstacles | Helper for a `?:` | Fallback |",
		"| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: |",
		...results.map(
			(r) =>
				`| [${r.name}](${r.url}) | [\`${r.tag}\`](${r.url}/tree/${r.commit}) | ${r.paths.map((path) => `\`${path}\``).join(", ")} | ${r.files} | ${r.diagnostics.length} | ${r.count("guard")} | ${r.count("move")} | ${r.obstacles} | ${r.count("helper")} | ${r.count("fallback")} |`,
		),
		"",
		"The fallback names no concrete change and promises no score, so it isn't applied.",
		"",
		"## Fixes applied",
		"",
		...outcomesTable(applied),
		"",
		"Points saved by the fixes that kept their promise, down to the higher of the two scores for a move or helper:",
		"",
		...KINDS.flatMap((kind) => savingsLine(applied, kind)),
		"",
		...(misses.length > 0
			? [
					"Fixes that didn't do what they promised:",
					"",
					...misses.map(
						(miss) =>
							`- ${miss.name} \`${miss.where}\`, ${miss.kind}: ${miss.before} to ${scores(miss)}, promised ${promisedScores(miss)} (${miss.outcome})`,
					),
					"",
				]
			: []),
		"## Examples",
		"",
		"The first diagnostic of each kind:",
		"",
		...examples.flatMap(([kind, diagnostic]) =>
			diagnostic
				? [`- **${kind}**, ${diagnostic.name} \`${diagnostic.filename}\`: ${diagnostic.message}`]
				: [],
		),
		"",
		"## What the outcomes mean",
		"",
		"- **as promised**: the function, and for a move or helper the new function, now score what the hint said.",
		"- **lower, not as promised** and **not lower**: the highest score changed by a different amount, or not at all.",
		"- **doesn't parse**: Oxlint rejects the rewritten file, for example because a name declared in a guard clause's body now clashes with one in the enclosing block.",
		"- **wrong exit**: the hint says `return` where the `if` sits in a loop body, or `continue` where it sits in a function body.",
		"- **not applied**: the hint names a workaround the script doesn't know.",
		"- **return not named**: the region has a `return` of the function's own, but the hint names no workaround for it.",
		"- **not reported** and **not found**: the script couldn't find the function again, or the code the hint names.",
		"",
		"## Not measured",
		"",
		"- Behavior. The rewrites are checked for their scores and for parsing, not for doing what the code did before. The rule doesn't check that a guard clause's body declares no name that shadows an outer one, or one used earlier in the block (see `docs/specs/diagnostics.md`), and a move's new function sees `this` and `arguments` differently once it's a function of its own.",
		"- Which variables a move hands back. Handing back a variable, or declaring one before the region, changes neither score, so the check confirms only that the file still parses with them. A wrong or missing variable shows up as a behavior change, which isn't measured.",
		"- Names past the first three. A hint lists at most three names to hand back, then `and N more`; the rewrite hands back the ones it lists. The rest change neither score nor whether the file parses.",
		"",
		"## Every diagnostic",
		"",
		...results.flatMap(listing),
	].join("\n");
}

mkdirSync(cache, { recursive: true });

const results = repositories.map(evaluate);
const output = join(root, "docs/evaluation/hints.md");

mkdirSync(dirname(output), { recursive: true });

writeFileSync(output, summary(results));

console.log(`Wrote ${output}`);

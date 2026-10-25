// Runs the rule over pinned open-source repositories, records every fix hint, and applies
// each guard-clause hint to check that the score drops to what the hint promises. Writes
// the summary to docs/evaluation/hints.md. Run by hand with `vp run evaluate-hints`; it is
// not part of `verify`, since it needs the network and its numbers move with the rule.
//
// The repositories are fetched at their pinned commits into HINT_EVAL_DIR, or a folder in
// the system temp directory, never into this repository.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const { parse } = createRequire(import.meta.url)("@typescript-eslint/parser");
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

	if (head !== repository.commit) {
		rmSync(dir, { recursive: true, force: true });

		mkdirSync(dir, { recursive: true });

		run("git", ["init", "-q"], dir);

		const fetch = run(
			"git",
			["fetch", "-q", "--depth", "1", repository.url, repository.commit],
			dir,
		);

		if (fetch.status !== 0) {
			throw new Error(`Couldn't fetch ${repository.name}: ${fetch.stderr}`);
		}

		run("git", ["-c", "advice.detachedHead=false", "checkout", "-q", "FETCH_HEAD"], dir);
	}

	return dir;
}

/** A config with the rule from this repository's source at `max`, and nothing else on. */
function config(max) {
	const file = join(cache, `oxlintrc-${max}.json`);

	writeFileSync(
		file,
		JSON.stringify({
			jsPlugins: [{ name: "complexity", specifier: join(root, "src/index.ts") }],
			categories: { correctness: "off" },
			rules: { "complexity/cognitive-complexity": ["error", max] },
		}),
	);

	return file;
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

const RULE = "complexity(cognitive-complexity)";

const GUARD =
	/invert the 'if' at line (\d+)(?:, column (\d+))? into a guard clause that (returns|continues)[^;]*; this one drops to (\d+)\.$/;

/** The kind of fix a message suggests. */
function kindOf(message) {
	if (GUARD.test(message)) {
		return "guard";
	}

	if (message.includes("into a helper function")) {
		return "helper";
	}

	return message.includes("into a new function") ? "move" : "fallback";
}

/** Does a move hint name an obstacle and its workaround? */
const hasObstacle = (message) =>
	/into a new function; it (returns|breaks|continues|reassigns|declares|awaits|yields)/.test(
		message,
	);

const score = (message) => Number(/has cognitive complexity (\d+)/.exec(message)[1]);

/** The `if` that starts at `line` (and `column`, 1-based, when given). */
function findIf(node, line, column) {
	if (!node || typeof node.type !== "string") {
		return undefined;
	}

	const { start } = node.loc;

	if (
		node.type === "IfStatement" &&
		start.line === line &&
		(!column || start.column + 1 === column)
	) {
		return node;
	}

	for (const [key, value] of Object.entries(node)) {
		const children = key === "parent" ? [] : [value].flat();
		const found = children.map((child) => findIf(child, line, column)).find(Boolean);

		if (found) {
			return found;
		}
	}

	return undefined;
}

/** `source` with the `if` turned into a guard clause, as the hint says. */
function invert(source, statement, exit) {
	const { test, consequent } = statement;
	const [start, end] = consequent.range;

	const body =
		consequent.type === "BlockStatement"
			? source.slice(start + 1, end - 1)
			: source.slice(start, end);

	const guard = `if (!(${source.slice(...test.range)})) ${exit === "returns" ? "return" : "continue"};\n${body}`;

	return source.slice(0, statement.range[0]) + guard + source.slice(statement.range[1]);
}

/**
 * Applies a guard hint to a copy of its file beside it, and scores the function again.
 * The copy keeps the extension, so it parses the same way.
 */
function applyGuard(dir, diagnostic) {
	const [, line, column, exit, promised] = GUARD.exec(diagnostic.message);
	const file = join(dir, diagnostic.filename);
	const source = readFileSync(file, "utf8");

	const ast = parse(source, {
		range: true,
		loc: true,
		sourceType: "module",
		jsx: extname(file).endsWith("x"),
	});

	const statement = findIf(ast, Number(line), column && Number(column));
	const result = { before: score(diagnostic.message), promised: Number(promised) };

	if (!statement) {
		return { ...result, outcome: "not found" };
	}

	const copy = join(dirname(file), `.hint-eval-${basename(file)}`);

	writeFileSync(copy, invert(source, statement, exit));

	try {
		const { span } = diagnostic.labels[0];
		const report = lint(dir, [copy], 0).diagnostics;

		const same = report.find(
			({ code, labels }) =>
				code === RULE && labels[0].span.line === span.line && labels[0].span.column === span.column,
		);

		if (report.some(({ code }) => code !== RULE)) {
			return { ...result, outcome: "doesn't parse" };
		}

		const after = same ? score(same.message) : 0;

		return { ...result, after, outcome: outcomeOf(result.before, after, result.promised) };
	} finally {
		rmSync(copy);
	}
}

function outcomeOf(before, after, promised) {
	if (after === promised) {
		return "as promised";
	}

	return after < before ? "lower, not as promised" : "not lower";
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

	const guards = (kinds.get("guard") ?? []).map((diagnostic) => ({
		where: `${diagnostic.filename}:${diagnostic.labels[0].span.line}`,
		...applyGuard(dir, diagnostic),
	}));

	return {
		...repository,
		files: report.number_of_files,
		diagnostics,
		count: (kind) => kinds.get(kind)?.length ?? 0,
		obstacles: (kinds.get("move") ?? []).filter(({ message }) => hasObstacle(message)).length,
		guards,
	};
}

const percent = (part, whole) => (whole === 0 ? "–" : `${Math.round((part / whole) * 100)}%`);

/** The summary page, in Markdown. */
function summary(results) {
	const guards = results.flatMap(({ name, guards }) => guards.map((guard) => ({ name, ...guard })));

	const outcomes = [
		"as promised",
		"lower, not as promised",
		"not lower",
		"doesn't parse",
		"not found",
	];

	const misses = guards.filter(({ outcome }) => outcome !== "as promised");

	const savings = guards
		.filter(({ after }) => after !== undefined)
		.map(({ before, after }) => before - after);

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
		"How the rule's fix hints do on real code. `scripts/evaluate-hints.mjs` runs the rule at the default max of 15 over the repositories below, at pinned commits, and records the hint in every diagnostic. Each guard-clause hint is then applied mechanically: the `if` becomes `if (!(test)) return;` or `continue;`, its body moves up a level, and the function is scored again.",
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
		"## Guard clauses applied",
		"",
		"| Outcome | Hints | Share |",
		"| --- | --: | --: |",
		...outcomes.map((outcome) => {
			const count = guards.filter((guard) => guard.outcome === outcome).length;

			return `| ${outcome} | ${count} | ${percent(count, guards.length)} |`;
		}),
		"",
		savings.length > 0
			? `Applied guards saved ${Math.min(...savings)} to ${Math.max(...savings)} points, ${(savings.reduce((a, b) => a + b, 0) / savings.length).toFixed(1)} on average.`
			: "No guard hints were applied.",
		"",
		...(misses.length > 0
			? [
					"Hints that didn't do what they promised:",
					"",
					...misses.map(
						({ name, where, before, after, promised, outcome }) =>
							`- ${name} \`${where}\`: ${before} to ${after ?? "?"}, promised ${promised} (${outcome})`,
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
		"## Not measured",
		"",
		"- Whether a guard clause keeps behavior. The rule only suggests one when returning or continuing early skips nothing, but a name declared in the body can clash once it moves up a level, which the hint doesn't check yet (see `docs/specs/diagnostics.md`).",
		"- Moves. Applying one means writing a new function and its call, with any workaround the hint names, which this script doesn't attempt.",
		"",
	].join("\n");
}

mkdirSync(cache, { recursive: true });

const results = repositories.map(evaluate);
const output = join(root, "docs/evaluation/hints.md");

mkdirSync(dirname(output), { recursive: true });

writeFileSync(output, summary(results));

console.log(`Wrote ${output}`);

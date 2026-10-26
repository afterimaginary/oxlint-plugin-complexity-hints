// Compares an edited ESLint rule with the original beyond what its tests assert: every
// option set the rule's test file uses, run on every test case's code, on ESLint's own
// lib/ and tests/fixtures/, and on a corpus ESLint doesn't lint itself with (Prettier's
// src/), where rules ESLint enforces on its own code still find things to report. Run by
// scripts/agent-benchmark/score.mjs as
// `node behavior-worker.cjs <base> <work> <rule> <cache> <corpus> <summary>`, with ESLint's
// Linter from the base tree. Code that doesn't parse is left out, since no rule runs on it.
// The original's results are computed once and kept in <cache>. Writes a JSON summary to
// <summary>, so nothing the edited rule prints can get in its way.
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const [base, work, rule, cache, corpus, summary] = process.argv.slice(2);
const { Linter } = require(path.join(base, "lib/linter"));

/** Stop comparing after this many differences; one is enough to fail. */
const LIMIT = 20;

/** The test file's option sets and code, read by loading it with a RuleTester that only records. */
function readTests() {
	const sets = new Map([["[]", []]]);
	const samples = [];

	class RecordingTester {
		constructor(config = {}) {
			this.languageOptions = config.languageOptions ?? {};
		}

		run(_name, _rule, { valid = [], invalid = [] }) {
			for (const test of [...valid, ...invalid]) {
				const {
					code,
					options = [],
					languageOptions = {},
					filename,
				} = typeof test === "string" ? { code: test } : test;

				sets.set(JSON.stringify(options), options);

				samples.push({
					name: `test case ${samples.length + 1}`,
					kind: "test",
					code,
					filename,
					languageOptions: { ...this.languageOptions, ...languageOptions },
				});
			}
		}
	}

	const load = Module._load;

	Module._load = function (request, parent, isMain) {
		if (request.endsWith("lib/rule-tester/rule-tester")) {
			return RecordingTester;
		}

		return load.call(this, request, parent, isMain);
	};

	// mocha's globals, for test files that call them at the top level.
	globalThis.describe = globalThis.it = () => {};

	try {
		require(path.join(base, "tests/lib/rules", `${rule}.js`));
	} finally {
		Module._load = load;
	}

	return { sets: [...sets.values()], samples };
}

function* files(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });

	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		const full = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			yield* files(full);
		} else if (/\.[cm]?js$/.test(entry.name)) {
			yield full;
		}
	}
}

function fileSamples() {
	const eslint = ["lib", "tests/fixtures"].flatMap((dir) =>
		[...files(path.join(base, dir))].map((file) => {
			const name = path.relative(base, file);

			return {
				name,
				kind: "corpus",
				code: fs.readFileSync(file, "utf8"),
				filename: name,
				languageOptions: { sourceType: name.endsWith(".mjs") ? "module" : "script" },
			};
		}),
	);

	// Prettier's sources are ES modules throughout.
	const prettier = [...files(corpus)].map((file) => {
		const name = path.join("prettier", path.relative(corpus, file));

		return {
			name,
			kind: "corpus",
			code: fs.readFileSync(file, "utf8"),
			filename: name,
			languageOptions: { sourceType: "module" },
		};
	});

	return [...eslint, ...prettier];
}

/** Whether `sample` parses under its own options, with no rules on. */
function parses(linter, sample) {
	return !linter
		.verify(
			sample.code,
			{ files: ["**/*"], languageOptions: { ecmaVersion: "latest", ...sample.languageOptions } },
			sample.filename ?? "sample.js",
		)
		.some(({ fatal }) => fatal);
}

/** What the rule reports on a sample, as comparable text, or the error it throws. */
function outcome(linter, ruleModule, options, sample) {
	try {
		const messages = linter.verify(
			sample.code,
			{
				files: ["**/*"],
				languageOptions: { ecmaVersion: "latest", ...sample.languageOptions },
				plugins: { bench: { rules: { rule: ruleModule } } },
				rules: { "bench/rule": ["error", ...options] },
			},
			sample.filename ?? "sample.js",
		);

		return JSON.stringify(
			messages
				.filter((message) => message.ruleId === "bench/rule" || message.fatal)
				.map(({ fatal, line, column, endLine, endColumn, message, fix, suggestions }) => ({
					fatal,
					line,
					column,
					endLine,
					endColumn,
					message,
					fix,
					suggestions: suggestions?.map(({ desc, fix: suggested }) => ({ desc, fix: suggested })),
				})),
		);
	} catch (error) {
		return `throws: ${String(error?.message ?? error).split("\n")[0]}`;
	}
}

const { sets, samples } = readTests();
const linter = new Linter({ configType: "flat" });
const candidates = [...samples, ...fileSamples()];
const all = candidates.filter((sample) => parses(linter, sample));
const checks = all.flatMap((sample) => sets.map((options) => ({ sample, options })));

/**
 * An outcome as a short hash, so the original's results for a rule with many option sets
 * fit in a file; the prefix says whether the rule reported anything.
 */
const digest = (text) =>
	`${text === "[]" || text.startsWith("throws") ? "-" : "+"}${crypto.createHash("sha256").update(text).digest("hex").slice(0, 24)}`;

const original = require(path.join(base, "lib/rules", `${rule}.js`));

if (!fs.existsSync(cache)) {
	const outcomes = checks.map(({ sample, options }) =>
		digest(outcome(linter, original, options, sample)),
	);

	// Written whole, then renamed, so a check running at the same time never reads part of it.
	fs.writeFileSync(`${cache}.${process.pid}`, JSON.stringify(outcomes));

	fs.renameSync(`${cache}.${process.pid}`, cache);
}

const expected = JSON.parse(fs.readFileSync(cache, "utf8"));

if (expected.length !== checks.length) {
	throw new Error(`The cache at ${cache} doesn't match this rule's checks`);
}

// The edited rule may print, for debugging; its output is dropped rather than filling memory.
for (const method of ["log", "info", "warn", "error", "debug", "trace", "dir", "table"]) {
	console[method] = () => {};
}

process.stdout.write = () => true;

const edited = require(path.join(work, "lib/rules", `${rule}.js`));
const differences = [];
let compared = 0;

for (const [index, { sample, options }] of checks.entries()) {
	if (differences.length >= LIMIT) {
		break;
	}

	const after = outcome(linter, edited, options, sample);

	compared++;

	if (digest(after) !== expected[index]) {
		differences.push({
			sample: sample.name,
			options,
			before: outcome(linter, original, options, sample).slice(0, 300),
			after: after.slice(0, 300),
		});
	}
}

/** Checks of `kind` where the original rule reported something. */
const reporting = (kind) =>
	expected.filter((hash, index) => hash.startsWith("+") && checks[index].sample.kind === kind)
		.length;

fs.writeFileSync(
	summary,
	JSON.stringify({
		optionSets: sets.length,
		samples: all.length,
		unparsed: candidates.length - all.length,
		checks: checks.length,
		compared,
		reporting: { test: reporting("test"), corpus: reporting("corpus") },
		differences,
	}),
);

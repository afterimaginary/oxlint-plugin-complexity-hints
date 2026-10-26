// Compares an edited ESLint rule with the original beyond what its tests assert: every
// option set the rule's test file uses, run on every test case's code and on ESLint's own
// lib/ and tests/fixtures/. Run by scripts/agent-benchmark/score.mjs as
// `node behavior-worker.cjs <base> <work> <rule> <cache>`, with ESLint's Linter from the
// base tree. The original's results are computed once and kept in <cache>. Prints a JSON
// summary.
"use strict";

const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");

const [base, work, rule, cache] = process.argv.slice(2);
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
	return ["lib", "tests/fixtures"].flatMap((dir) =>
		[...files(path.join(base, dir))].map((file) => {
			const name = path.relative(base, file);

			return {
				name,
				code: fs.readFileSync(file, "utf8"),
				filename: name,
				languageOptions: { sourceType: name.endsWith(".mjs") ? "module" : "script" },
			};
		}),
	);
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
const all = [...samples, ...fileSamples()];
const linter = new Linter({ configType: "flat" });
const checks = all.flatMap((sample) => sets.map((options) => ({ sample, options })));

if (!fs.existsSync(cache)) {
	const original = require(path.join(base, "lib/rules", `${rule}.js`));
	const outcomes = checks.map(({ sample, options }) => outcome(linter, original, options, sample));

	fs.writeFileSync(cache, JSON.stringify(outcomes));
}

const expected = JSON.parse(fs.readFileSync(cache, "utf8"));

if (expected.length !== checks.length) {
	throw new Error(`The cache at ${cache} doesn't match this rule's checks`);
}

const edited = require(path.join(work, "lib/rules", `${rule}.js`));
const differences = [];
let compared = 0;

for (const [index, { sample, options }] of checks.entries()) {
	if (differences.length >= LIMIT) {
		break;
	}

	const after = outcome(linter, edited, options, sample);

	compared++;

	if (after !== expected[index]) {
		differences.push({
			sample: sample.name,
			options,
			before: expected[index].slice(0, 300),
			after: after.slice(0, 300),
		});
	}
}

process.stdout.write(
	JSON.stringify({
		optionSets: sets.length,
		samples: all.length,
		checks: checks.length,
		compared,
		reporting: expected.filter((text) => text !== "[]" && !text.startsWith("throws")).length,
		differences,
	}),
);

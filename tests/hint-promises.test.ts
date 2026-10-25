import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vite-plus/test";
import { applyAll, type Report } from "../scripts/apply-hints.ts";

const root = join(import.meta.dirname, "..");
const project = mkdtempSync(join(tmpdir(), "complexity-promises-"));

// Each fixture, linted at max 0, covers one kind of fix or obstacle. Embedded scripts are
// left out: the rewrites parse plain JavaScript and TypeScript.
const fixtures = ["fixes.js", "guards.js", "obstacles.js", "labels.ts", "contributors.js"];

afterAll(() => {
	rmSync(project, { recursive: true, force: true });
});

function lint(paths: string[]): Report {
	const result = spawnSync(
		join(root, "node_modules/.bin/oxlint"),
		["-c", "oxlintrc.json", "--format", "json", ...paths],
		{
			cwd: project,
			encoding: "utf8",
			timeout: 60_000,
			maxBuffer: 1 << 26,
		},
	);

	if (!result.stdout.startsWith("{")) {
		throw new Error(result.stdout + result.stderr);
	}

	return JSON.parse(result.stdout) as Report;
}

// Every hint states the score its change reaches. Making each change the way the hint
// says and linting again checks that statement for every kind of fix and obstacle.
describe("every fix hint in the CLI fixtures", () => {
	test("reaches the scores it promises", () => {
		for (const fixture of fixtures) {
			cpSync(join(root, "tests/fixtures/cli", fixture), join(project, fixture));
		}

		writeFileSync(
			join(project, "oxlintrc.json"),
			JSON.stringify({
				jsPlugins: [{ name: "complexity", specifier: join(root, "src/index.ts") }],
				categories: { correctness: "off" },
				rules: { "complexity/cognitive-complexity": ["error", 0] },
			}),
		);

		const applied = applyAll(project, lint(fixtures).diagnostics, lint);

		const misses = applied
			.filter(({ outcome }) => outcome !== "as promised")
			.map(
				({ diagnostic, outcome, after, moved }) =>
					`${diagnostic.filename}:${diagnostic.labels[0]!.span.line} ${outcome} ${JSON.stringify({ after, moved })}: ${diagnostic.message}`,
			);

		expect(misses).toEqual([]);

		// A run that applied nothing would pass the check above.
		expect(new Set(applied.map(({ kind }) => kind))).toEqual(new Set(["guard", "move", "helper"]));
	});
});

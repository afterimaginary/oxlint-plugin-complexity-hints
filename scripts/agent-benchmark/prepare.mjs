// Builds what every run of the agent benchmark starts from: ESLint at its pinned commit
// with its dependencies installed, and each arm's plugin bundled into one file. Runs copy
// the tree and link its `node_modules`, so this is done once. See
// docs/designs/agent-benchmark.md.
import { createHash } from "node:crypto";
import {
	cpSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite/rolldown";
import { checkout, repositories, root, run } from "../eval-repos.mjs";
import { ARMS } from "./arm-plugin.ts";

/**
 * Where the benchmark keeps its trees and records. Not the temp folder, which macOS clears
 * of files untouched for three days; not under the home folder, whose path names the user
 * and shows in every record; and on the same volume as /tmp, which runs' leftovers move from.
 */
export const benchDir =
	process.env.AGENT_BENCH_DIR ??
	(platform() === "darwin"
		? "/Users/Shared/complexity-agent-benchmark"
		: join(tmpdir(), "complexity-agent-benchmark"));

export const baseDir = join(benchDir, "eslint");
export const bundleDir = join(benchDir, "plugins");

/** Prettier's src/, which the behavior check runs rules on besides ESLint's own code. */
export const corpusDir = join(benchDir, "corpus");

const here = join(root, "scripts/agent-benchmark");
const lockfile = join(here, "eslint-package-lock.json");
const eslint = repositories.find(({ name }) => name === "ESLint");
const prettier = repositories.find(({ name }) => name === "Prettier");

/**
 * The files a counted run's code is in, outside `src/` (which the plugin hashes cover).
 * The analysis and the command line aren't among them, since they don't change a run.
 */
const HARNESS = [
	"scripts/agent-benchmark/arm-plugin.ts",
	"scripts/agent-benchmark/behavior-worker.cjs",
	"scripts/agent-benchmark/counted.mjs",
	"scripts/agent-benchmark/eslint-package-lock.json",
	"scripts/agent-benchmark/prepare.mjs",
	"scripts/agent-benchmark/records.mjs",
	"scripts/agent-benchmark/run-agent.mjs",
	"scripts/agent-benchmark/score.mjs",
	"scripts/agent-benchmark/tasks.mjs",
	"scripts/agent-benchmark/workspace.mjs",
	"scripts/apply-hints.ts",
	"scripts/eval-repos.mjs",
];

const SDK = JSON.parse(
	readFileSync(join(root, "node_modules/@anthropic-ai/claude-agent-sdk/package.json"), "utf8"),
).version;

/** The Oxlint the hook and the agent run, the version this repository is tested with. */
const OXLINT = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).devDependencies.oxlint;

/** Where each run finds its arm's plugin, relative to the run's tree, and the config naming it. */
export const PLUGIN_PATH = ".oxlint/complexity.mjs";

export const OXLINTRC = {
	jsPlugins: [{ name: "complexity", specifier: `./${PLUGIN_PATH}` }],
	rules: { "complexity/cognitive-complexity": ["error", { max: 15 }] },
};

/** The README's lint hook, read from the README so the runs use exactly what it tells people to. */
const SETTINGS = JSON.parse(
	/```json\n(\{\n\t"hooks"[\s\S]*?)```/.exec(readFileSync(join(root, "README.md"), "utf8"))[1],
);

/**
 * The environment the agent's code runs in while it's scored: just enough to find Node,
 * so nothing of the user's reaches it.
 */
export const SCORING_ENV = { PATH: process.env.PATH };

/** Git with no global or system config, so the user's settings can't change what it records. */
export const GIT_ENV = {
	PATH: process.env.PATH,
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
};

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function step(command, args, cwd) {
	const result = run(command, args, cwd);

	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`);
	}

	return result.stdout;
}

/** What each arm's bundle exports: the bare rule, or this rule under the arm's strategy. */
const entryOf = ({ strategy }) => {
	const from = (file) => JSON.stringify(join(root, file));

	return strategy
		? `import { createRule } from ${from("src/rules/cognitive-complexity.ts")};\nimport { plugin } from ${from("scripts/agent-benchmark/arm-plugin.ts")};\nexport default plugin(createRule(${JSON.stringify(strategy)}));\n`
		: `import { bare, plugin } from ${from("scripts/agent-benchmark/arm-plugin.ts")};\nexport default plugin(bare());\n`;
};

/** Each arm's plugin as one ES module with no imports but Node's, so nothing in a run's tree names the arm. */
async function bundle() {
	mkdirSync(bundleDir, { recursive: true });

	const hashes = {};

	for (const entry of ARMS) {
		const { arm } = entry;
		const file = join(bundleDir, `${arm}.mjs`);

		await build({
			input: "arm-entry",
			platform: "node",
			plugins: [
				{
					name: "arm-entry",
					resolveId: (id) => (id === "arm-entry" ? id : undefined),
					load: (id) => (id === "arm-entry" ? entryOf(entry) : undefined),
				},
			],
			output: { file, format: "esm", minify: true },
			logLevel: "warn",
		});

		hashes[arm] = sha256(readFileSync(file));
	}

	return hashes;
}

/**
 * Throws unless the base tree is exactly its one commit with its dependencies in place,
 * so a tree the system's temp cleanup has partly removed isn't silently used.
 */
function verifyBase() {
	const status = step("git", ["status", "--porcelain"], baseDir);
	const subject = step("git", ["log", "-1", "--format=%s"], baseDir).trim();

	if (
		status.trim() !== "" ||
		subject !== `ESLint ${eslint.tag}` ||
		!existsSync(join(baseDir, "node_modules/mocha/bin/mocha")) ||
		!existsSync(join(baseDir, "node_modules/.bin/oxlint"))
	) {
		throw new Error(
			`The base tree at ${baseDir} isn't intact (${status.trim().split("\n").length} changes); delete it and run again to rebuild it.`,
		);
	}
}

/** Prettier's src/ at its pinned commit, for the behavior check. */
function corpus() {
	if (existsSync(corpusDir)) {
		return;
	}

	const archive = join(benchDir, "prettier.tar");
	const staging = `${corpusDir}.partial`;

	rmSync(staging, { recursive: true, force: true });

	mkdirSync(staging);

	step("git", ["archive", "-o", archive, prettier.commit, "src"], checkout(prettier));

	step("tar", ["-xf", archive, "-C", staging, "--strip-components=1"], benchDir);

	rmSync(archive);

	// Renamed only once it's whole, so a corpus that exists is complete.
	renameSync(staging, corpusDir);
}

/** ESLint's tree with Oxlint added as a dev dependency, installed from the committed lockfile, and committed as one commit. */
function base() {
	if (existsSync(join(baseDir, ".git"))) {
		verifyBase();

		return;
	}

	rmSync(baseDir, { recursive: true, force: true });

	mkdirSync(baseDir, { recursive: true });

	const source = checkout(eslint);
	const archive = join(benchDir, "eslint.tar");

	step("git", ["archive", "-o", archive, eslint.commit], source);

	step("tar", ["-xf", archive, "-C", baseDir], benchDir);

	rmSync(archive);

	const manifest = join(baseDir, "package.json");
	const pkg = JSON.parse(readFileSync(manifest, "utf8"));

	pkg.devDependencies.oxlint = OXLINT;

	writeFileSync(manifest, `${JSON.stringify(pkg, null, 4)}\n`);

	writeFileSync(join(baseDir, ".oxlintrc.json"), `${JSON.stringify(OXLINTRC, null, 4)}\n`);

	mkdirSync(join(baseDir, ".claude"));

	writeFileSync(
		join(baseDir, ".claude/settings.json"),
		`${JSON.stringify(SETTINGS, null, "\t")}\n`,
	);

	if (existsSync(lockfile)) {
		cpSync(lockfile, join(baseDir, "package-lock.json"));

		step("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], baseDir);
	} else {
		step(
			"npm",
			["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=true"],
			baseDir,
		);

		cpSync(join(baseDir, "package-lock.json"), lockfile);
	}

	step("git", ["init", "-q"], baseDir);

	writeFileSync(join(baseDir, ".git/info/exclude"), "/node_modules\n/.oxlint/\n");

	step("git", ["add", "-A"], baseDir);

	step(
		"git",
		[
			"-c",
			"user.name=ESLint",
			"-c",
			"user.email=eslint@localhost",
			"commit",
			"-q",
			"-m",
			`ESLint ${eslint.tag}`,
		],
		baseDir,
	);

	// Runs share these through a link; making them read-only keeps one run from changing another's.
	step("chmod", ["-R", "a-w", join(baseDir, "node_modules")], baseDir);
}

/** What a run's results depend on, recorded with every run. */
export function provenance(hashes) {
	return {
		eslint: { tag: eslint.tag, commit: eslint.commit },
		corpus: { tag: prettier.tag, commit: prettier.commit },
		lockfile: sha256(readFileSync(lockfile)),
		// This repository's lockfile pins the parser the scoring counts functions and comments with.
		repositoryLockfile: sha256(readFileSync(join(root, "pnpm-lock.yaml"))),
		node: process.version,
		oxlint: OXLINT,
		sdk: SDK,
		hook: sha256(JSON.stringify(SETTINGS)),
		plugins: hashes,
		harness: sha256(HARNESS.map((file) => sha256(readFileSync(join(root, file)))).join("\n")),
	};
}

/** The bundles as they are now, hashed without rebuilding them. */
export const bundleHashes = () =>
	Object.fromEntries(
		ARMS.map(({ arm }) => [arm, sha256(readFileSync(join(bundleDir, `${arm}.mjs`)))]),
	);

export async function prepare() {
	// Only this user reads it; /Users/Shared is open to every account.
	mkdirSync(benchDir, { recursive: true, mode: 0o700 });

	base();

	corpus();

	return provenance(await bundle());
}

if (import.meta.main) {
	console.log(JSON.stringify(await prepare(), null, 2));
}

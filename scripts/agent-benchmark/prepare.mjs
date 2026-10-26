// Builds what every run of the agent benchmark starts from: ESLint at its pinned commit
// with its dependencies installed, and each arm's plugin bundled into one file. Runs copy
// the tree and link its `node_modules`, so this is done once. See
// docs/designs/agent-benchmark.md.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite/rolldown";
import { checkout, repositories, root, run } from "../eval-repos.mjs";
import { ARMS } from "./arm-plugin.ts";

export const benchDir = process.env.AGENT_BENCH_DIR ?? join(tmpdir(), "complexity-agent-benchmark");
export const baseDir = join(benchDir, "eslint");
export const bundleDir = join(benchDir, "plugins");

const here = join(root, "scripts/agent-benchmark");
const lockfile = join(here, "eslint-package-lock.json");
const eslint = repositories.find(({ name }) => name === "ESLint");

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

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function step(command, args, cwd) {
	const result = run(command, args, cwd);

	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`);
	}

	return result.stdout;
}

/** Each arm's plugin as one ES module with no imports but Node's, so nothing in a run's tree names the arm. */
async function bundle() {
	mkdirSync(bundleDir, { recursive: true });

	const hashes = {};

	for (const { arm } of ARMS) {
		const file = join(bundleDir, `${arm}.mjs`);

		await build({
			input: "arm-entry",
			platform: "node",
			plugins: [
				{
					name: "arm-entry",
					resolveId: (id) => (id === "arm-entry" ? id : undefined),
					load: (id) =>
						id === "arm-entry"
							? `import { armPlugin } from ${JSON.stringify(join(here, "arm-plugin.ts"))};\nexport default armPlugin(${JSON.stringify(arm)});\n`
							: undefined,
				},
			],
			output: { file, format: "esm", minify: true },
			logLevel: "warn",
		});

		hashes[arm] = sha256(readFileSync(file));
	}

	return hashes;
}

/** ESLint's tree with Oxlint added as a dev dependency, installed from the committed lockfile, and committed as one commit. */
function base() {
	if (existsSync(join(baseDir, ".git"))) {
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
		lockfile: sha256(readFileSync(lockfile)),
		oxlint: OXLINT,
		plugins: hashes,
	};
}

export async function prepare() {
	mkdirSync(benchDir, { recursive: true });

	base();

	return provenance(await bundle());
}

if (import.meta.main) {
	console.log(JSON.stringify(await prepare(), null, 2));
}

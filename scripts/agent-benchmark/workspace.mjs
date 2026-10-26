// A run's working tree: a clone of the base commit with the shared `node_modules` linked
// in and the arm's plugin at the path the config names. Nothing in it names the arm.
import { randomBytes } from "node:crypto";
import { copyFileSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "../eval-repos.mjs";
import { baseDir, benchDir, bundleDir, GIT_ENV, PLUGIN_PATH } from "./prepare.mjs";

export const runsDir = join(benchDir, "runs");

/** A fresh tree for `arm`, under a random name, and the folder beside it for the run's records. */
export function createWorkspace(arm) {
	const id = randomBytes(6).toString("hex");

	mkdirSync(join(runsDir, id, "meta"), { recursive: true });

	// The temp folder is a link on macOS; the agent sees real paths, so the run does too.
	const dir = realpathSync(join(runsDir, id));
	const work = join(dir, "work");
	const meta = join(dir, "meta");

	// npm's cache, which `npx` writes to, kept in the run so the sandbox can allow it.
	const npmCache = join(dir, "npm-cache");

	mkdirSync(npmCache);

	// The session's home, empty, so nothing of the user's is in it.
	const home = join(dir, "home");

	mkdirSync(home);

	const clone = run("git", ["clone", "-q", "--shared", baseDir, work], runsDir, { env: GIT_ENV });

	if (clone.status !== 0) {
		throw new Error(clone.stderr);
	}

	writeFileSync(join(work, ".git/info/exclude"), "/node_modules\n/.oxlint/\n");

	symlinkSync(join(baseDir, "node_modules"), join(work, "node_modules"));

	mkdirSync(join(work, ".oxlint"));

	copyFileSync(join(bundleDir, `${arm}.mjs`), join(work, PLUGIN_PATH));

	return {
		id,
		dir,
		work,
		meta,
		npmCache,
		home,
	};
}

export function removeWorkspace({ dir }) {
	rmSync(dir, { recursive: true, force: true });
}

// Which lines a change touches, from git. See "The change" in docs/specs/scoped-checker.md.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";

/** A failure to set up the check, as opposed to something it found. Exits 2. */
export class SetupError extends Error {}

/** The changed lines of one file, or "all" for an untracked file. */
export type Lines = Set<number> | "all";

function tryGit(cwd: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
	const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 1 << 28 });

	if (result.error) {
		throw new SetupError(`couldn't run git: ${result.error.message}`);
	}

	return { ok: result.status === 0, stdout: result.stdout, stderr: result.stderr };
}

/** Git's output, or a setup error saying what couldn't be done. */
function git(cwd: string, args: string[], what: string): string {
	const { ok, stdout, stderr } = tryGit(cwd, args);

	if (!ok) {
		throw new SetupError(`couldn't ${what}: ${stderr.trim()}`);
	}

	return stdout;
}

/** The repository's top directory, with symlinks resolved. */
export function repositoryRoot(cwd: string): string {
	const { ok, stdout } = tryGit(cwd, ["rev-parse", "--show-toplevel"]);

	if (!ok) {
		throw new SetupError("not in a git repository");
	}

	return realpathSync(stdout.trim());
}

function defaultBranch(root: string): string {
	const remote = tryGit(root, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"]);

	if (remote.ok) {
		return remote.stdout.trim();
	}

	const local = ["main", "master"].find(
		(branch) => tryGit(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).ok,
	);

	if (!local) {
		throw new SetupError(
			"no default branch found (origin/HEAD, main or master); pass --base <ref>",
		);
	}

	return local;
}

/** The commit the change is measured from: the merge base of HEAD and `ref`. */
export function resolveBase(root: string, ref = defaultBranch(root)): string {
	const { ok, stdout } = tryGit(root, ["merge-base", "HEAD", ref]);

	if (!ok) {
		throw new SetupError(
			`no merge base between HEAD and '${ref}'; on a shallow clone, fetch more history`,
		);
	}

	return stdout.trim();
}

// Pinned against user config that changes the output: prefixes, relative paths, renames
// and the quoting of non-ASCII paths. Renames are followed, so a moved file counts only
// for the lines that changed in it.
const DIFF = [
	"-c",
	"core.quotePath=false",
	"diff",
	"--no-ext-diff",
	"--no-color",
	"--no-relative",
	"--find-renames",
	"--src-prefix=a/",
	"--dst-prefix=b/",
	"--unified=0",
];

const ESCAPES: Record<string, string> = {
	a: "\x07",
	b: "\b",
	f: "\f",
	n: "\n",
	r: "\r",
	t: "\t",
	v: "\v",
};

/** A path as git prints it in a header: C-quoted when it holds `"`, `\` or a control character. */
function unquote(path: string): string {
	if (!path.startsWith('"')) {
		return path;
	}

	const bytes: number[] = [];
	const body = path.slice(1, -1);

	for (let index = 0; index < body.length; index++) {
		const char = body[index]!;

		if (char !== "\\") {
			bytes.push(...Buffer.from(char));
		} else if (/[0-7]{3}/.test(body.slice(index + 1, index + 4))) {
			// Octal escapes are the bytes of a UTF-8 sequence.
			bytes.push(Number.parseInt(body.slice(index + 1, index + 4), 8));

			index += 3;
		} else {
			const next = body[++index]!;

			bytes.push(...Buffer.from(ESCAPES[next] ?? next));
		}
	}

	return Buffer.from(bytes).toString("utf8");
}

/**
 * Adds the new-file lines one hunk header (`@@ -a,b +c,d @@`) touches, and returns how
 * many lines of content follow it.
 */
function addHunk(lines: Set<number>, header: string): number {
	const [, removed, start, count] = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(header) ?? [];
	const first = Number(start);
	const length = count === undefined ? 1 : Number(count);

	if (length === 0) {
		// A deletion sits after line `first`: it touches the lines on either side.
		lines.add(first);

		lines.add(first + 1);
	}

	for (let line = first; line < first + length; line++) {
		lines.add(line);
	}

	return (removed === undefined ? 1 : Number(removed)) + length;
}

/** The new file's path in a `+++ ` header, or undefined for a deleted file. */
function newPath(header: string): string | undefined {
	// Git ends a path holding a space with a tab.
	const path = unquote(header.slice(4).replace(/\t$/, ""));

	return path.startsWith("b/") ? path.slice(2) : undefined;
}

/**
 * Every changed file, by path relative to the repository root, with the lines the change
 * touches in it: tracked files against `base`, in the working tree, and untracked files
 * that git doesn't ignore, whole. Deleted files are left out.
 */
export function changedLines(root: string, base: string): Map<string, Lines> {
	const changes = new Map<string, Lines>();
	let current: Set<number> | undefined;
	// Lines of hunk content still to come, which can look like headers: `+++ x` is an
	// added line holding `++ x`.
	let content = 0;

	for (const line of git(root, [...DIFF, base], "list the changes").split("\n")) {
		if (content > 0) {
			// "\ No newline at end of file" isn't content.
			content -= line.startsWith("\\") ? 0 : 1;
		} else if (line.startsWith("+++ ")) {
			const path = newPath(line);

			current = undefined;

			if (path !== undefined) {
				current = new Set();

				changes.set(path, current);
			}
		} else if (line.startsWith("@@ ") && current) {
			content = addHunk(current, line);
		}
	}

	const untracked = git(
		root,
		["ls-files", "--others", "--exclude-standard", "-z"],
		"list untracked files",
	);

	for (const path of untracked.split("\0").filter(Boolean)) {
		changes.set(path, "all");
	}

	return changes;
}

/** Whether `changed` holds any of `lines`. */
export function touches(changed: Lines, lines: Iterable<number>): boolean {
	for (const line of lines) {
		if (changed === "all" || changed.has(line)) {
			return true;
		}
	}

	return false;
}

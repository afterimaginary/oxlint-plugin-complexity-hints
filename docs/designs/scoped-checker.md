# Scoped checker

How `complexity-hints` works. What it does is specified in [`docs/specs/scoped-checker.md`](../specs/scoped-checker.md), and why it exists in ADR-0006.

## Flow

`src/checker/cli.ts` is the bin. For one run it:

1. finds the repository root and the base, and lists the changed lines (`changes.ts`);
2. keeps the changed files Oxlint lints, narrowed to the paths given, if any, and stops if none are left;
3. finds and runs the project's Oxlint on them for its JSON report (`oxlint.ts`);
4. sorts each file's diagnostics into blocks and notes (`scope.ts`);
5. prints them and exits with the result.

With `--claude-code-hook`, the files come from the hook's input instead (`claude-code.ts`), filtered to the project's directory, and the run prints to stderr and remaps the exit codes, as the spec's [Claude Code hook](../specs/scoped-checker.md#claude-code-hook) says.

Every module uses Node built-ins only, so the package keeps no runtime dependencies. A `SetupError` from any step, or anything unexpected, exits 2, so a broken setup is never read as a finding.

## Changed lines (`changes.ts`)

- The root is `git rev-parse --show-toplevel`, with symlinks resolved. Every path the checker compares is resolved the same way: on macOS the temp directory is `/var/…` while git reports `/private/var/…`.
- The base is `git merge-base HEAD <ref>`, where `<ref>` is `--base` or the default branch: `origin/HEAD` if set, or else a local `main` or `master`.
- `git diff --unified=0 <base>` compares the base with the working tree, so staged and unstaged changes count along with commits since the base. Only the `+++` lines and hunk headers are read: each hunk header's new-side start and count gives the changed lines, and a count of 0, a pure deletion, gives the lines on either side. The header's two counts also say how many lines of content follow, which are skipped, since an added line holding `++ x` reads `+++ x`. A path git quotes, for holding `"` or a control character, is unquoted.
- The diff's format is pinned against the user's git config: `core.quotePath=false` (non-ASCII paths printed as they are), fixed `a/` and `b/` prefixes, `--no-relative`, `--find-renames`, `--no-ext-diff` and `--no-color`. Following renames means a moved file counts only for the lines that changed in it.
- A git command that fails is a setup error, with git's own message.
- Path arguments are resolved against the repository root, with only the parent's symlinks resolved, and match a file or the files under a directory. A path outside the repository is a setup error.
- Untracked files come from `git ls-files --others --exclude-standard -z`, and count as changed throughout.

## Running Oxlint (`oxlint.ts`)

- **Which binary.** `--oxlint <path>` is run from the current directory. Otherwise the checker walks up from the current directory to the first `node_modules/.bin` that holds `vp` or `oxlint`, and runs it from that directory, so the project's config is the one found there. `vp` (or `vp.cmd`, `vp.exe`) wins and runs as `vp lint`: the `oxlint` that Vite+ installs serves editors only, and only `vp lint` reads the `lint` block of `vite.config.ts`.
- **Environment.** A plain `oxlint` runs without `VP_VERSION`. Vite+ sets it in everything it runs, and with it set, `oxlint` reads its config as a Vite+ one and skips `.oxlintrc.json`, linting with no rules at all.
- **Arguments.** `--format json --no-error-on-unmatched-pattern` and the files, relative to the run's directory, split into several runs when the list would pass 30,000 characters.
- **Failure.** Oxlint exits 1 whenever it reports an error, so the exit code says nothing about whether it ran. Output that doesn't parse as its JSON report is the failure.

## Sorting diagnostics (`scope.ts`)

- **`cognitive-complexity`** is recognized by its message, not its code, so a plugin alias works. `parseMessage` reads the function's span from the last `at line(s) …` before the stable `has cognitive complexity N, over the max of M`, since the label before it is free text, and the target from the first position in the fix. Every fix wording names its target first, and `tests/checker.test.ts` pins each one. The fallback's wordings start `split` or `replace` and target the whole function.
- **Nested functions.** A function's own lines drop the lines strictly inside other reported functions within its span, other than those with the same span. A nested function's first and last lines stay, since they usually hold the outer function's code too, such as the call the nested function is passed to.
- **`max-params`** is recognized by its code ending `(max-params)`. Its label spans the parameter list, and its last line comes from the label's offset and length, which count UTF-8 bytes, so the file is read as a `Buffer`.
- A diagnostic at `warn` that would block becomes a note.

## Limits

- One Oxlint install and one config, found from the current directory, lint every changed file. In a monorepo, files of another package are linted with this package's config. Running from that package, or `--oxlint`, is the way around it.
- The checker reads the rule's message, so a change to the wording of the span or of a fix's target has to change `scope.ts` too. The message tests in `tests/checker.test.ts` fail when they drift apart.
- Submodules aren't followed: the parent repository's diff shows a submodule as one entry.
- The change is everything in the working tree since the base, whoever made it. Agents editing one checkout at once each see the others' edits as part of the change, so one can be blocked by another's work, or catch it mid-edit. Give each parallel agent its own worktree; the commit or CI gate then checks the combined change.

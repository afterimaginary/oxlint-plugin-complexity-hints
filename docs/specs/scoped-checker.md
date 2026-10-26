# Scoped checker

`complexity-hints` runs Oxlint on a change and reports only what the change is responsible for (ADR-0006). How it works is in the [design](../designs/scoped-checker.md).

## Usage

```
complexity-hints [--base <ref>] [--strict] [--oxlint <path>] [<path>...]
```

| Option            | Meaning                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `--base <ref>`    | Compare against the merge base of `HEAD` and `<ref>`. By default, `<ref>` is the default branch.   |
| `--strict`        | Block on every over-max function the change touches, wherever its fix points.                      |
| `--oxlint <path>` | Run this Oxlint binary, or `vp`, instead of searching for one. It runs from the current directory. |
| `<path>...`       | Check only these files, or the files in these directories, of those the change touched.            |
| `--help`          | Print usage and exit 0.                                                                            |

## The change

The change is every line that differs between the base and the working tree, staged or not, plus every line of each untracked file that git doesn't ignore.

- **The base** is the merge base of `HEAD` and the default branch. The default branch is `origin/HEAD` when it is set, or else a local `main` or `master`. With `--base <ref>`, it is the merge base of `HEAD` and `<ref>`.
- **No base, no check.** When there is no default branch or no merge base, as on a shallow CI checkout, the checker exits 2 and asks for `--base`. It never falls back to checking less.
- **A deletion** with nothing added in its place touches the lines just before and after it.
- **A deleted file** has nothing to check.
- **A renamed file** counts only for the lines that changed in it.
- **Files Oxlint lints:** only changed files with the extensions `.js .jsx .ts .tsx .mjs .cjs .mts .cts .vue .svelte .astro` are linted, and the project's ignore patterns still apply.
- Submodules aren't followed.

## What it reports

Oxlint runs once on the changed files, with the project's config. Of its diagnostics, the checker keeps two rules and drops the rest, which the project's own lint reports.

### `cognitive-complexity`

Recognized by its message, so a plugin alias works. The message gives the function's span (`at lines A-B`) and the fix's target: the first position in the fix (`move lines 19-22 …`, `invert the 'if' at line 3 …`, `move the '?:' at line 80, column 43 …`). The fallback (`split …`, `replace …`) gives a direction rather than a change at its line, so, like a fix with no position, it targets the whole function.

A function's **own lines** are its span minus the lines strictly inside functions nested in it that are reported in the same run. A nested function's first and last lines stay, since they usually hold code of the function around it too, such as the call the nested function is passed to. A function scoring nothing isn't reported, so an edit inside a nested callback that scores 0 still counts as touching the function around it.

| The change overlaps                     | Default      | `--strict`   |
| --------------------------------------- | ------------ | ------------ |
| none of the function's own lines        | not reported | not reported |
| its own lines and the fix's target      | **blocks**   | **blocks**   |
| its own lines, but not the fix's target | note         | **blocks**   |

### `max-params`

Oxlint's `max-params` reports the parameter list, which is also where its fix goes. A diagnostic whose parameter list overlaps the change blocks; any other isn't reported.

### Severity

Only a diagnostic at `error` can block. One that would block at `warn` is a note instead.

## Output

Blocking diagnostics first, one per line in Oxlint's `agent` format, with paths relative to the current directory:

```
src/shipping.js:1:17: error complexity(cognitive-complexity): Function 'shippingCost' at lines 1-27 has cognitive complexity 20, …
```

Then, when there are notes, a line saying they don't block, and each note in the same format with `note` in place of `error`:

```
Not blocking: the fix points outside the change, or the rule is set to warn.
src/rates.js:40:10: note complexity(cognitive-complexity): Function 'lookup' at lines 40-71 has cognitive complexity 17, …
```

Everything goes to stdout. Errors about the setup go to stderr.

## Exit codes

| Code | Meaning                                                                                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Nothing blocks. Notes may have printed. With no changed file to lint, Oxlint doesn't run.                                                                                                       |
| 1    | Something blocks.                                                                                                                                                                               |
| 2    | The check couldn't run: not in a git repository, no base, git failing, no Oxlint found, Oxlint output that isn't its JSON report, a path outside the repository, an unknown option, or a crash. |

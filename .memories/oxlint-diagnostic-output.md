---
date: 2026-10-23
description: Read when changing the rule's message, or tests that assert on messages or CLI output.
---

# Oxlint diagnostic output gotchas

Verified with Oxlint 1.83.0.

- **The message is the whole payload.** JS-plugin diagnostics have no `help` or `url` channel in any output format, and `--format agent` prints `file:line:col: severity plugin(rule): <message>` on one line, turning any newline in the message into a space. That's why `describeFunction` collapses whitespace in labels.
- **`RuleTester` accepts `message: RegExp`**, but only when `data` is absent. Partial `data` never matches, because it renders the template with just the given keys. `tests/helpers.ts` matches the stable score fragment by regex, so scoring tests don't break when the rest of the message changes.
- **Oxlint lints files in parallel, so the CLI's output order isn't stable.** `tests/cli.test.ts` sorts lines by line number before snapshotting, and runs from the repository root with relative paths, so snapshots don't embed a checkout path.
- **A config inside `tests/fixtures/cli/` resolves `jsPlugins` specifiers relative to itself.** It is named `oxlintrc.json`, not `.oxlintrc.json`, so Oxlint never auto-discovers it during the repository's own lint run.

---
description: The package ships an optional command, complexity-hints, that runs Oxlint on a change and reports only what the change is responsible for; the rule itself stays unaware of git.
status: accepted
---

# ADR-0006: A scoped checker alongside the rule

## Context

The rule scores whole files, so linting a file reports every function in it that is over the max, whether or not the change being made touched it. An agent fixing those is pulled into restructuring code outside its task, and the edits land in its diff with no visible reason, which is what this plugin exists to prevent. Telling the agent to leave them alone works only as well as the agent follows instructions.

What a change is responsible for depends on git: which lines changed against which base. An Oxlint rule sees one file's syntax tree and nothing else, so it can't decide this, and it shouldn't try: the same rule runs in editors, where there is no base.

The [agent pilot](../evaluation/agent-pilot.md) found that agents often edit through Bash, which a hook on Claude Code's Edit and Write tools never sees, so the scoping can't rely on an edit tool reporting which file changed.

## Decision

The package ships a command, `complexity-hints`, alongside the rule. It finds the changed lines with `git diff`, runs the project's own Oxlint on the changed files, and keeps only the diagnostics the change is responsible for. Its behavior is specified in [`docs/specs/scoped-checker.md`](../specs/scoped-checker.md), and how it works in [`docs/designs/scoped-checker.md`](../designs/scoped-checker.md).

The rule stays as it is: it knows nothing about git, and it remains the only rule. The diagnostic gives the checker what it needs, since its message names the lines the function spans and the fix's target.

## Rationale

**Scope is decided where git is.** A command can read the repository, take a base, and see every changed file however it was edited. The rule can't, and making it read git would tie a lint rule to the working tree it runs in.

**It reads the rule's own output.** The checker parses the message the rule already prints, so it adds no parser and no runtime dependency, and runs whatever Oxlint and config the project already has. The message's wording is specified, and the checker's tests pin each form it reads.

**One command serves the agent and the gate.** The same exit code works after an agent's edit and in pre-commit or CI.

## Consequences

- ADR-0001's "the plugin's surface is one rule and its options" no longer holds: the surface is one rule, its options, and this command. The rule is still the only rule.
- The package gains a `bin`. It still has no runtime dependencies.
- The checker depends on the message's format. A change to the wording of the range or of a fix's target has to change the checker in the same commit, which the checker's tests enforce.
- Comparing a function's score with its score at the base is out of scope: a function the change touched is held to the max, not to its old score.

# Project State

**Goal:** An Oxlint plugin that keeps code written by coding agents easy for people to review: it scores cognitive complexity, and tells the agent exactly how to fix an over-complex function without reaching outside its change.

## Where We Are

`complexity/cognitive-complexity` scores every function as specified in `docs/specs/scoring.md`, matching `eslint-plugin-sonarjs` except for the documented whitepaper deviations, which differential and fuzz tests check. Over the max, it reports a single-line message, specified in `docs/specs/diagnostics.md`, that names the lines the function spans, the main contributors and one fix with the score it reaches: a guard clause when it alone brings the function to the max, or else whichever of the guard and a region to move into a new function leaves the lower score, with what stands in the way of moving it (ADR-0005). Every hint that states a score is checked against it: `tests/hint-promises.test.ts` applies each fix in the CLI fixtures, and `vp run evaluate-hints` applies all 318 on four pinned open-source repositories, where every one reaches exactly the scores it promised (`docs/evaluation/hints.md`). `vp run simulate-hints` plays the lint loop on the same code to compare how the rule chooses between a guard clause and a move (`docs/evaluation/strategies.md`): "guard if enough" reaches the max in fewer lint rounds than "guard first" (89 against 144 where they differ), at the cost of a few more extracted functions. An agent pilot (`docs/evaluation/agent-pilot.md`) gave Claude Sonnet 5.5 44 ESLint functions under this rule's message and under a bare score: every run succeeded either way, and with this rule's message the changes were about a tenth smaller. It also found that agents often edit through Bash. `complexity-hints` (ADR-0006, `docs/specs/scoped-checker.md`) runs Oxlint on a change and reports only the over-max functions the change touched, blocking when the fix points into the change too. The README's agent setup runs it from a Claude Code `PostToolUse` hook on Edit, Write and Bash (`complexity-hints --claude-code-hook`), gates commits and CI with it, and gives guidance for agent instructions; `install.md` walks an agent through all of it. The README leads with that purpose and the evidence for it; the rule docs and the `recommended` preset are in place.

With this, the "Reviewable agent changes" milestone is done: every hint's promise checked, the hint strategy chosen by measurement, and diagnostics scoped to the change under review. Next is "Launch": the release process is in place (ADR-0007: a GitHub release's tag is the version, and CI publishes through npm's trusted publishing), and what's left is the first publish (#19) and making the repository public (#20).

## Features

- [x] `complexity/cognitive-complexity` rule
- [x] Single-line, actionable diagnostics (#7)
- [x] `recommended` preset (#12)
- [x] Every hint kind's promise checked, in `verify` and on real code (#40)
- [x] Hint strategy chosen by simulation and an agent pilot (#41, #42, #43)
- [x] Scoped checker that reports only what a change is responsible for (#44)
- [x] Agent setup: per-edit hook, commit gate and instructions (#45)
- [ ] Published to npm as `oxlint-plugin-complexity-hints` (#19)

## Recently Done

- The Claude Code hook is now one command, `complexity-hints --claude-code-hook`, and `install.md` walks an agent through setting everything up, linked from the top of the README
- README, package and repository descriptions lead with reviewable agent changes and the evaluations' results (#46)
- README agent setup: a `PostToolUse` hook on Edit, Write and Bash running `complexity-hints`, the commit and CI gate, and guidance for agent instructions (#45)
- `complexity-hints`, a checker that reports only what a change is responsible for, recorded as ADR-0006 (#44)
- The fix hint suggests a guard clause only when it alone reaches the max, recorded as ADR-0005 (#43)

## Up Next

1. First npm publish by hand, then trusted publishing for the `release` workflow (#19)
2. Launch checklist: make the repository public (#20).

## Needs Your Decision

- Launch timing (#20), and whether `oxlint` becomes an optional peer dependency.

## Notes

- Public-facing repository (see `CONTRIBUTING.md`): issues, PRs and commits must be presentable, with no personal identifiers.
- Work order: "Reviewable agent changes" (#38 to #46), then "Launch" (#19, #20), then "After launch" (#17, #47). Within a milestone, take the lowest-numbered issue whose dependencies (listed in each issue) are closed.
- Every hint states the score it reaches, and `tests/hint-promises.test.ts` checks that promise. A new hint kind ships only with that check.
- The agent setup (hook, guidance, pilot) targets and is tested with Claude Code only, as the README says. Other agents are to be revisited later.
- Agents stay within their change: diagnostics outside it don't block by default (#44), and refactoring goes in its own behavior-preserving commit (#45).

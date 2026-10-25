# Project State

**Goal:** An Oxlint plugin that keeps code written by coding agents easy for people to review: it scores cognitive complexity, and tells the agent exactly how to fix an over-complex function without reaching outside its change.

## Where We Are

`complexity/cognitive-complexity` scores every function as specified in `docs/specs/scoring.md`, matching `eslint-plugin-sonarjs` except for the documented whitepaper deviations, which differential and fuzz tests check. Over the max, it reports a single-line message, specified in `docs/specs/diagnostics.md`, that names the main contributors and one fix with the score it reaches: a guard clause when one saves points, or else a region to move into a new function, with what stands in the way of moving it. Every hint that states a score is checked against it: `tests/hint-promises.test.ts` applies each fix in the CLI fixtures, and `vp run evaluate-hints` applies all 318 on four pinned open-source repositories, where every one reaches exactly the scores it promised (`docs/evaluation/hints.md`). `vp run simulate-hints` plays the lint loop on the same code to compare how the rule chooses between a guard clause and a move (`docs/evaluation/strategies.md`). "Guard if enough", a guard clause only when it alone reaches the max, reaches the max in fewer lint rounds than today's "guard first" (89 against 144 where they differ), at the cost of a few more extracted functions, and is the candidate for #42 and #43. The README, the rule docs and the `recommended` preset are in place.

The diagnostic text is what sets this plugin apart, so the next milestone, "Reviewable agent changes", makes it hold up: every hint's promise checked, the hint strategy chosen by measurement, and diagnostics scoped to the change under review.

## Features

- [x] `complexity/cognitive-complexity` rule
- [x] Single-line, actionable diagnostics (#7)
- [x] `recommended` preset (#12)
- [x] Every hint kind's promise checked, in `verify` and on real code (#40)
- [ ] Hint strategy chosen by simulation and an agent benchmark (#41, #42, #43)
- [ ] Scoped checker that reports only what a change is responsible for (#44)
- [ ] Published to npm as `oxlint-plugin-complexity-hints` (#19)

## Recently Done

- Hint strategies compared by simulating the lint loop; "guard if enough" recommended (#41)
- Every move and helper hint checked against its promise, in `verify` and on real code (#40)
- README claims matched to the evidence, with a Limits section, and the Oxlint-only scope recorded as ADR-0004 (#39)
- Renamed to `oxlint-plugin-complexity-hints`, with the plugin alias documented (#38)
- Fix hints evaluated on pinned open-source repositories (#37)

## Up Next

1. Benchmark hint strategies with a coding agent in the loop (#42): guard first against guard if enough, and the "how far over the max" wording carried over from #41
2. Ship the hint strategy the evaluations support (#43)
3. Scoped checker that reports only what a change is responsible for (#44)

## Needs Your Decision

- Agent runner, model and token budget for the agent benchmark (#42), when the work reaches it.
- Command name and flags for the scoped checker (#44), when the work reaches it.
- Release tool and npm publishing setup (#19), and launch timing (#20).

## Notes

- Public-facing repository (see `CONTRIBUTING.md`): issues, PRs and commits must be presentable, with no personal identifiers.
- Work order: "Reviewable agent changes" (#38 to #46), then "Launch" (#19, #20), then "After launch" (#17, #47). Within a milestone, take the lowest-numbered issue whose dependencies (listed in each issue) are closed.
- Every hint states the score it reaches, and `tests/hint-promises.test.ts` checks that promise. A new hint kind ships only with that check.
- Agents stay within their change: diagnostics outside it don't block by default (#44), and refactoring goes in its own behavior-preserving commit (#45).

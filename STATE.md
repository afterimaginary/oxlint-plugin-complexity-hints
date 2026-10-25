# Project State

**Goal:** An Oxlint plugin that keeps code written by coding agents easy for people to review: it scores cognitive complexity, and tells the agent exactly how to fix an over-complex function without reaching outside its change.

## Where We Are

`complexity/cognitive-complexity` scores every function as specified in `docs/specs/scoring.md`, matching `eslint-plugin-sonarjs` except for the documented whitepaper deviations, which differential and fuzz tests check. Over the max, it reports a single-line message, specified in `docs/specs/diagnostics.md`, that names the main contributors and one fix with the score it reaches: a guard clause when one saves points, or else a region to move into a new function, with what stands in the way of moving it. `vp run evaluate-hints` checks guard-clause hints on four pinned open-source repositories, where every one lowers the score exactly as promised (`docs/evaluation/hints.md`). The README, the rule docs and the `recommended` preset are in place.

The diagnostic text is what sets this plugin apart, so the next milestone, "Reviewable agent changes", makes it hold up: every hint's promise checked, the hint strategy chosen by measurement, and diagnostics scoped to the change under review.

## Features

- [x] `complexity/cognitive-complexity` rule
- [x] Single-line, actionable diagnostics (#7)
- [x] `recommended` preset (#12)
- [ ] Every hint kind's promise checked on real code (#40)
- [ ] Hint strategy chosen by simulation and an agent benchmark (#41, #42, #43)
- [ ] Scoped checker that reports only what a change is responsible for (#44)
- [ ] Published to npm as `oxlint-plugin-complexity-hints` (#19)

## Recently Done

- README claims matched to the evidence, with a Limits section, and the Oxlint-only scope recorded as ADR-0004 (#39)
- Renamed to `oxlint-plugin-complexity-hints`, with the plugin alias documented (#38)
- Fix hints evaluated on pinned open-source repositories (#37)
- Fuzzed against `eslint-plugin-sonarjs` on random programs (#36)
- README and rule docs for users, with their examples checked against the rule (#35)

## Up Next

1. Check move-hint promises in the hint evaluation (#40)
2. Simulate the lint loop to compare hint strategies (#41)
3. Benchmark hint strategies with a coding agent in the loop (#42)

## Needs Your Decision

- Agent runner, model and token budget for the agent benchmark (#42), when the work reaches it.
- Command name and flags for the scoped checker (#44), when the work reaches it.
- Release tool and npm publishing setup (#19), and launch timing (#20).

## Notes

- Public-facing repository (see `CONTRIBUTING.md`): issues, PRs and commits must be presentable, with no personal identifiers.
- Work order: "Reviewable agent changes" (#38 to #46), then "Launch" (#19, #20), then "After launch" (#17, #47). Within a milestone, take the lowest-numbered issue whose dependencies (listed in each issue) are closed.
- Every hint states the score it reaches, and the evaluation checks that promise (#40). A new hint kind ships only with that check.
- Agents stay within their change: diagnostics outside it don't block by default (#44), and refactoring goes in its own behavior-preserving commit (#45).

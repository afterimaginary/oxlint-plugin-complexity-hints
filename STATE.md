# Project State

**Goal:** An Oxlint plugin that scores cognitive complexity and tells AI coding agents exactly how to fix an over-complex function.

## Where We Are

The repository is scaffolded as a Vite+ library with linting, formatting, git hooks and the `verify` CI workflow. The roadmap is planned as issues across five milestones, and the scope decisions are recorded as ADR-0001 to ADR-0003. `complexity/cognitive-complexity` scores every function as specified in `docs/specs/scoring.md` and reports those over `max` with a single-line message, specified in `docs/specs/diagnostics.md`, that names the main contributors and one fix: a guard clause when one saves points, or else a region to move into a new function, with what stands in the way of moving it. A differential test checks every fixture against `eslint-plugin-sonarjs`, with the whitepaper deviations pinned, and a fuzz test does the same for random programs. JSX conditional rendering scores nothing, and TypeScript-only syntax adds nothing. The repository lints itself with the rule. The README and `docs/rules/cognitive-complexity.md` cover installing, configuring and agent setup. `vp run evaluate-hints` measures the hints on four pinned open-source repositories, with results in `docs/evaluation/hints.md`: every guard-clause hint there lowers the score exactly as promised.

## Features

- [x] `complexity/cognitive-complexity` rule
- [x] Single-line, actionable diagnostics (#7)
- [x] `recommended` preset (#12)
- [ ] Published to npm (#19)

## Recently Done

- Fix hints evaluated on pinned open-source repositories (#37)
- Fuzzed against `eslint-plugin-sonarjs` on random programs (#36)
- README and rule docs for users, with their examples checked against the rule (#35)
- Package contents checked, and the build loads on Node 20.19 (#34)
- CLI output pinned in the default and agent formats, with exit codes (#32)

## Up Next

1. Performance benchmark and budget (#17)
2. Release process and npm publishing with provenance (#19)
3. Launch checklist: make the repository public (#20)

## Needs Your Decision

- Release tool and npm publishing setup (#19), when the work reaches it.
- Launch timing and repository settings (#20).

## Notes

- Public-facing repository (see `CONTRIBUTING.md`): issues, PRs and commits must be presentable, with no personal identifiers.
- Work is paused after #16. Resume with #17, the last issue in "Beyond the basics"; after it, #19 and #20 need decisions before they start.
- Work order: the earliest milestone first, then the lowest-numbered issue whose dependencies (listed in each issue) are closed.

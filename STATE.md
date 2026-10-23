# Project State

**Goal:** An Oxlint plugin that scores cognitive complexity and tells AI coding agents exactly how to fix an over-complex function.

## Where We Are

The repository is scaffolded as a Vite+ library with linting, formatting, git hooks and the `verify` CI workflow. The roadmap is planned as issues across five milestones, and the scope decisions are recorded as ADR-0001 to ADR-0003. No rule code exists yet; `src/` still holds the starter module.

## Features

- [ ] `complexity/cognitive-complexity` rule (#3)
- [ ] Single-line, actionable diagnostics (#7)
- [ ] `recommended` preset (#12)
- [ ] Published to npm (#19)

## Recently Done

- Scope decisions recorded as ADRs (#1)
- Project bootstrap

## Up Next

1. Plugin skeleton: register `complexity/cognitive-complexity` with Oxlint (#2)
2. Score cognitive complexity per function (#3)
3. Differential tests against `eslint-plugin-sonarjs` (#4)

## Needs Your Decision

- Release tool and npm publishing setup (#19), when the work reaches it.
- Launch timing and repository settings (#20).

## Notes

- Public-facing repository (see `CONTRIBUTING.md`): issues, PRs and commits must be presentable, with no personal identifiers.
- Work order: the earliest milestone first, then the lowest-numbered issue whose dependencies (listed in each issue) are closed.

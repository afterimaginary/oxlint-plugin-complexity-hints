# Project State

**Goal:** An Oxlint plugin that scores cognitive complexity and tells AI coding agents exactly how to fix an over-complex function.

## Where We Are

The repository is scaffolded as a Vite+ library with linting, formatting, git hooks and the `verify` CI workflow. The roadmap is planned as issues across five milestones, and the scope decisions are recorded as ADR-0001 to ADR-0003. `complexity/cognitive-complexity` scores every function as specified in `docs/specs/scoring.md` and reports those over `max` with a placeholder message. A differential test checks every fixture against `eslint-plugin-sonarjs`, with the whitepaper deviations pinned. JSX conditional rendering scores nothing, and TypeScript-only syntax adds nothing.

## Features

- [x] `complexity/cognitive-complexity` rule
- [ ] Single-line, actionable diagnostics (#7)
- [ ] `recommended` preset (#12)
- [ ] Published to npm (#19)

## Recently Done

- TypeScript and JSX syntax handled (#5)
- Differential tests against `eslint-plugin-sonarjs` (#25)
- Cognitive complexity scored per function (#24)
- Plugin skeleton registered with Oxlint (#23)
- Scope decisions recorded as ADRs (#22)
- Project bootstrap

## Up Next

1. Lint this repo with its own rule (#6)
2. Single-line, actionable diagnostics (#7)
3. Fix hint: guard clause for the deepest `if` (#8)

## Needs Your Decision

- Release tool and npm publishing setup (#19), when the work reaches it.
- Launch timing and repository settings (#20).

## Notes

- Public-facing repository (see `CONTRIBUTING.md`): issues, PRs and commits must be presentable, with no personal identifiers.
- Work order: the earliest milestone first, then the lowest-numbered issue whose dependencies (listed in each issue) are closed.

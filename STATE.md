# Project State

**Goal:** An Oxlint plugin that scores cognitive complexity and tells AI coding agents exactly how to fix an over-complex function.

## Where We Are

The repository is scaffolded as a Vite+ library with linting, formatting, git hooks and the `verify` CI workflow. The roadmap is planned as issues across five milestones, and the scope decisions are recorded as ADR-0001 to ADR-0003. `complexity/cognitive-complexity` scores every function as specified in `docs/specs/scoring.md` and reports those over `max` with a single-line message, specified in `docs/specs/diagnostics.md`, that names the main contributors and one fix: a guard clause when one saves points, or else a region to move into a new function, with what stands in the way of moving it. A differential test checks every fixture against `eslint-plugin-sonarjs`, with the whitepaper deviations pinned. JSX conditional rendering scores nothing, and TypeScript-only syntax adds nothing. The repository lints itself with the rule.

## Features

- [x] `complexity/cognitive-complexity` rule
- [x] Single-line, actionable diagnostics (#7)
- [ ] `recommended` preset (#12)
- [ ] Published to npm (#19)

## Recently Done

- CLI output pinned in the default and agent formats, with exit codes (#32)
- Line numbers in messages match the file for `.vue`, `.svelte` and `.astro` (#31)
- Moves name their obstacles and count the workaround (#30)
- Guard-clause fix hint (#29)
- Single-line diagnostics with contributors and a fix (#28)
- Repository lints itself with its own rule (#27)
- TypeScript and JSX syntax handled (#26)
- Differential tests against `eslint-plugin-sonarjs` (#25)
- Cognitive complexity scored per function (#24)
- Plugin skeleton registered with Oxlint (#23)
- Scope decisions recorded as ADRs (#22)
- Project bootstrap

## Up Next

1. `recommended` preset: JSON plus a typed TS export (#12)
2. Package build, exports map and a Node floor smoke test (#13)
3. README and rule docs for users (#14)

## Needs Your Decision

- Release tool and npm publishing setup (#19), when the work reaches it.
- Launch timing and repository settings (#20).

## Notes

- Public-facing repository (see `CONTRIBUTING.md`): issues, PRs and commits must be presentable, with no personal identifiers.
- Work order: the earliest milestone first, then the lowest-numbered issue whose dependencies (listed in each issue) are closed.

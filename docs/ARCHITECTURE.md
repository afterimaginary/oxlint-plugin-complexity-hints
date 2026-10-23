# Architecture

complexity-plugin-oxlint is an Oxlint JS plugin, published as an ES module package.

## Layout

| Path     | Contents                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------- |
| `src/`   | Plugin source. Imports the plugin API from `@oxlint/plugins` so the package works in plain Oxlint. |
| `tests/` | Vitest suites, run with `vp test`.                                                                 |
| `dist/`  | Build output from `vp pack`. Not committed.                                                        |

## Plugin

`src/index.ts` default-exports the Oxlint plugin `complexity`, which registers one rule per file in `src/rules/`. Today that is `cognitive-complexity` (`src/rules/cognitive-complexity.ts`). Oxlint loads the entry either from `dist/` or straight from source through Node's type stripping, which is why relative imports carry `.ts` extensions. The package has no runtime dependencies: `@oxlint/plugins` supplies types only, and `oxlint` is a peer dependency.

## Scoring

The scoring rules are specified in [`docs/specs/scoring.md`](specs/scoring.md). The code splits them three ways:

| File                                | Responsibility                                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scoring.ts`                    | Which nodes are function units, which unit an increment belongs to and at what nesting level, how many `&&` runs a chain has, and which chains are JSX conditional rendering. |
| `src/report-location.ts`            | Which token a unit's diagnostic points at.                                                                                                                                    |
| `src/rules/cognitive-complexity.ts` | The Oxlint wiring: options, one visitor per counted construct, and the report when a unit's `:exit` visitor runs.                                                             |

Attribution and nesting are computed from each increment's `parent` chain up to its nearest function unit, so no state carries from one unit to another. Scores for a file live in a map that is reset in the `before` hook.

## Tests

Tests run the rule through Oxlint's `RuleTester` over `tests/fixtures/`, which lint and formatting skip so their line and column expectations stay fixed.

- `tests/oracle.test.ts` uses `eslint-plugin-sonarjs` as the oracle. It runs sonarjs through ESLint and `@typescript-eslint/parser` over every fixture, and expects this rule to report the same `line:column=total` set. A fixture whose first line is `// @expect line:column=total, ...` pins those functions' totals in place of sonarjs's, while the rest of the file is still compared. Pins are reserved for the deviations listed in the scoring spec, and the test fails once sonarjs agrees with a pin.
- `tests/whitepaper.test.ts` holds the whitepaper's published totals, so they don't depend on the sonarjs version.
- `tests/options.test.ts` and `tests/plugin.test.ts` cover the rule options and loading through the Oxlint CLI.

## Toolchain

Development uses [Vite+](https://viteplus.dev): `vp check` for formatting, linting and type checking, `vp test` for tests and `vp pack` for the build. Linting includes this plugin's own rule, loaded from `src/index.ts`. The `ready` and `verify` scripts in `package.json` are the only verification entry points; CI runs `verify` on GitHub-hosted runners (`.github/workflows/verify.yml`).

Two TypeScript versions are installed side by side. `typescript` is TypeScript 6 (`@typescript/typescript6`), because `@typescript-eslint/parser` needs a TypeScript with a JavaScript API, and TypeScript 7 has none. TypeScript 7 is installed as `@typescript/native-preview`, where `vp pack` looks for the native compiler that generates declarations.

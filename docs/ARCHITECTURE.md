# Architecture

complexity-plugin-oxlint is an Oxlint JS plugin, published as an ES module package.

## Layout

| Path               | Contents                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `src/`             | Plugin source. Imports the plugin API from `@oxlint/plugins` so the package works in plain Oxlint. |
| `tests/`           | Vitest suites, run with `vp test`.                                                                 |
| `docs/rules/`      | User docs for each rule, linked from the README. The specs in `docs/specs/` are the exact rules.   |
| `scripts/`         | Checks on the built package, run by `verify`: its contents and a load on the Node floor.           |
| `dist/`            | Build output from `vp pack`. Not committed.                                                        |
| `recommended.json` | The preset for `.oxlintrc.json`, written by `vp pack`. Not committed.                              |

## Plugin

`src/index.ts` default-exports the Oxlint plugin `complexity`, which registers one rule per file in `src/rules/`. Today that is `cognitive-complexity` (`src/rules/cognitive-complexity.ts`). Oxlint loads the entry either from `dist/` or straight from source through Node's type stripping, which is why relative imports carry `.ts` extensions. The package has no runtime dependencies: `@oxlint/plugins` supplies types only, and `oxlint` is a peer dependency.

## Preset

`src/recommended.ts` holds the `recommended` preset (ADR-0003) as a typed config, published as `complexity-plugin-oxlint/recommended` for `extends` in `oxlint.config.ts`. A `build:done` hook in the `pack` block of `vite.config.ts` reads the built module back and writes the same object to `recommended.json` at the package root, for `.oxlintrc.json`. The TypeScript file is the one source of both, and `tests/recommended.test.ts` builds the package and lints through each form as an installed copy.

## Scoring

The scoring rules are specified in [`docs/specs/scoring.md`](specs/scoring.md), and the message in [`docs/specs/diagnostics.md`](specs/diagnostics.md). The code splits them like this:

| File                                | Responsibility                                                                                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scoring.ts`                    | Which nodes are function units, which unit an increment belongs to and at what nesting level, how many `&&` runs a chain has, and which chains are JSX conditional rendering. |
| `src/report-location.ts`            | Which token a unit's diagnostic points at.                                                                                                                                    |
| `src/script-block.ts`               | Where an embedded script block starts in its file, and moving the message's positions from the block to the file.                                                             |
| `src/describe-function.ts`          | How the message names a unit.                                                                                                                                                 |
| `src/contributors.ts`               | Grouping and ranking a unit's increments for the message.                                                                                                                     |
| `src/guard-clause.ts`               | Which `if` can become a guard clause without skipping anything, and how many points that saves.                                                                               |
| `src/hint.ts`                       | The one suggested fix: a guard clause, or else which region to move into a new function.                                                                                      |
| `src/obstacles.ts`                  | What stands in the way of moving a region unchanged, the workaround and what it costs, from a walk of the region and Oxlint's scope manager.                                  |
| `src/rules/cognitive-complexity.ts` | The Oxlint wiring: options, one visitor per counted construct, and the report when a unit's `:exit` visitor runs.                                                             |

Attribution and nesting are computed from each increment's `parent` chain up to its nearest function unit, so no state carries from one unit to another. Scores for a file live in a map that is reset in the `before` hook.

## Tests

Tests run the rule through Oxlint's `RuleTester` over `tests/fixtures/`, which lint and formatting skip so their line and column expectations stay fixed.

- `tests/oracle.test.ts` uses `eslint-plugin-sonarjs` as the oracle. It runs sonarjs through ESLint and `@typescript-eslint/parser` over every fixture, and expects this rule to report the same `line:column=total` set. A fixture whose first line is `// @expect line:column=total, ...` pins those functions' totals in place of sonarjs's, while the rest of the file is still compared. Pins are reserved for the deviations listed in the scoring spec, and the test fails once sonarjs agrees with a pin. The sonarjs setup lives in `tests/sonarjs.ts`.
- `tests/fuzz.test.ts` is the same comparison over random programs. `tests/programs.ts` generates modules that nest every counted and uncounted construct, closures, classes and JSX, and that always parse. With fast-check's seed and case count fixed, `verify` runs the same 1,000 programs every time. Each program runs through `RuleTester` inside the property, with `describe` and `it` made to run inline, so a disagreement fails the property and fast-check shrinks it to a minimal program. The generator never puts a function directly in a ternary branch, the one shape the branch-position fixtures pin instead.
- `tests/whitepaper.test.ts` holds the whitepaper's published totals, so they don't depend on the sonarjs version.
- `tests/options.test.ts` and `tests/plugin.test.ts` cover the rule options and loading through the Oxlint CLI.
- `tests/cli.test.ts` runs the repository's Oxlint binary over `tests/fixtures/cli/` and snapshots what users and agents see: every diagnostic in `--format agent`, one in the default format, and the exit codes. Its config is `tests/fixtures/cli/oxlintrc.json`, not `.oxlintrc.json`, so Oxlint never picks it up on its own. It always names the format, since Oxlint switches to `agent` when it detects an agent.
- `tests/docs.test.ts` lints the code examples in `README.md` and `docs/rules/cognitive-complexity.md`, and expects exactly the diagnostics shown beside them, so those diagnostics can't fall behind the rule. The README example runs with the preset's rules and Oxlint's default categories, as a user would have them.
- `tests/script-block.test.ts` covers where an embedded script block starts, for the cases the CLI can't show: Windows line endings, and the fallbacks such as an unsaved buffer.

## Toolchain

Development uses [Vite+](https://viteplus.dev): `vp check` for formatting, linting and type checking, `vp test` for tests and `vp pack` for the build. Linting includes this plugin's own rule, loaded from `src/index.ts`. The `ready` and `verify` scripts in `package.json` are the only verification entry points; CI runs `verify` on GitHub-hosted runners (`.github/workflows/verify.yml`).

`verify` ends with two checks on the built package. `scripts/check-package.mjs` compares what `pnpm pack` would publish with a fixed list of files. `scripts/smoke-dist.mjs` loads `dist/` with plain `node`, checks that the plugin registers `cognitive-complexity` and that both forms of the preset agree, then runs the built rule through Oxlint on the same Node. CI runs the smoke test again on Node 20.19.0, the floor of `engines.node`, which matches Oxlint's own, and the script fails if it finds a different Node. Development and CI otherwise use Node 24, set by `.node-version`, so `engines.node` stays a consumer-facing range.

Two TypeScript versions are installed side by side. `typescript` is TypeScript 6 (`@typescript/typescript6`), because `@typescript-eslint/parser` needs a TypeScript with a JavaScript API, and TypeScript 7 has none. TypeScript 7 is installed as `@typescript/native-preview`, where `vp pack` looks for the native compiler that generates declarations.

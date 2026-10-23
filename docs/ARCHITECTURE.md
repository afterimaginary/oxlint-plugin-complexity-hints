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

## Toolchain

Development uses [Vite+](https://viteplus.dev): `vp check` for formatting, linting and type checking, `vp test` for tests and `vp pack` for the build. The `ready` and `verify` scripts in `package.json` are the only verification entry points; CI runs `verify` on GitHub-hosted runners (`.github/workflows/verify.yml`).

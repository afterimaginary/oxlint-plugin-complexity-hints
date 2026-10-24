---
date: 2026-10-23
description: Read when changing plugin imports, the lint config for src/, or how tests run Oxlint.
---

# Oxlint plugin tooling gotchas

Verified with Vite+ 0.3.3 and Oxlint 1.83.0.

- **`node_modules/.bin/oxlint` belongs to whichever package wins the bin link.** Without the `oxlint` devDependency it is Vite+'s wrapper, which only serves the editor's language server. Tests that run the CLI need the real `oxlint` devDependency.
- **The edit hook's `vp check --fix` rewrites `@oxlint/plugins` to `vite-plus/lint/plugins`** in any file where `vite-plus/prefer-vite-plus-imports` is on. The `src/**` override in `vite.config.ts` turns it off and bans `vite-plus` imports, so a rewrite fails lint instead of slipping into `dist/index.d.mts`.
- **Oxlint's `no-restricted-imports` ignored glob `patterns`** (`"vite-plus/*"`, and `{ group: [...] }`): they matched nothing. Use `{ regex: "^vite-plus(/|$)" }`.
- **`vp pack` inlines the `@oxlint/plugins` types into `dist/index.d.mts`** because it is a devDependency, and records that as `inlinedDependencies` in `package.json`. Keep that field committed, or every build dirties the tree.
- **Under Vite+, Oxlint reads `oxlint.config.ts` as a Vite+ config.** Vite+ sets `VP_VERSION` for every command it runs (`vp test` included), and with it Oxlint expects the settings under a `lint` field and fails with "Expected a lint field in the default export of …/oxlint.config.ts". A test that lints with a plain `oxlint.config.ts` must drop `VP_VERSION` from Oxlint's environment.
- **`CI` or `FORCE_COLOR` turns on colors and a Unicode code frame** in the default format, even with `NO_COLOR` set. Tests that snapshot it drop both from Oxlint's environment.
- **Oxlint rejects an enabled rule that the plugin does not register**: `Rule '<name>' not found in plugin '<plugin>'`, exit 1. A load test can rely on this to prove registration.

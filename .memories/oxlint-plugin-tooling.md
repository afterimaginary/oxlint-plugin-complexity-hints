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
- **Oxlint rejects an enabled rule that the plugin does not register**: `Rule '<name>' not found in plugin '<plugin>'`, exit 1. A load test can rely on this to prove registration.

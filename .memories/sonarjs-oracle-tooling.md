---
date: 2026-10-23
description: Read when changing the sonarjs oracle test, its ESLint setup, or the TypeScript packages in package.json.
---

# sonarjs oracle tooling gotchas

Verified with ESLint 10.13.0, `@typescript-eslint/parser` 8.72.0 and `eslint-plugin-sonarjs` 4.2.2.

- **`@typescript-eslint/parser` throws on TypeScript 7** ("does not support TypeScript 7.0"), because TS 7 has no JavaScript API. pnpm `overrides` don't change how a peer dependency resolves, so scoping TS 6 to the parser doesn't work. The fix is the documented alias `"typescript": "npm:@typescript/typescript6@^6"`.
- **`vp pack` then fails with "TypeScript Go is not installed"**: tsdown's declaration generator looks for `@typescript/native-preview` or `typescript@7`. Installing TS 7 under that name (`"@typescript/native-preview": "npm:typescript@^7"`) satisfies it.
- **`Linter.verify(code, config, filename)` needs a relative filename.** An absolute path matches no `files` glob, and ESLint returns a single "No matching configuration" message instead of lint results. The oracle throws on any message that isn't a sonarjs score, so this fails loudly rather than leaving a fixture with no expectations.
- **RuleTester columns are 0-based, while ESLint's and the Oxlint CLI's are 1-based.** `reports()` in `tests/helpers.ts` converts between them.

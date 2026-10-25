---
description: The plugin targets Oxlint only; it ships no ESLint entry point and no Biome plugin.
status: accepted
---

# ADR-0004: Oxlint only

## Context

The rule works on an ESTree syntax tree through Oxlint's JS plugin API, which follows ESLint's v9 plugin API. Oxlint's `eslintCompatPlugin` wraps a rule written with `createOnce` so that the same plugin also runs under ESLint. An ESLint build is feasible.

Biome added JS plugins in v2.6 as a developer preview. Their API mirrors Biome's Rust lint rules and works on Biome's own syntax tree, not ESTree.

## Decision

The plugin targets Oxlint only. The package, preset, docs and tests are for Oxlint. There is no ESLint entry point and no Biome plugin.

## Rationale

**The diagnostic is designed around Oxlint's output.** Oxlint gives a plugin's diagnostic a single line, with no help text or docs URL, and its `agent` format prints one line per diagnostic. The message format (see the diagnostics spec) is built for that: the whole fix has to fit in the message. ESLint integrations show more around a diagnostic, such as a link to the rule's docs, so the best message there may be a different one. Supporting both would mean either designing for the narrower host everywhere, or maintaining two designs.

**Each host multiplies the verification.** The scores are checked against `eslint-plugin-sonarjs` on fixtures and on random programs, the CLI output is pinned, and the hints are evaluated on real code. Under ESLint, all of that would also have to run on typescript-eslint's syntax tree, and on the scope manager the ESLint parser provides, which the obstacle analysis depends on. The position correction for `.vue`, `.svelte` and `.astro` files is Oxlint-specific, because the framework parsers ESLint uses already report positions in the file.

**Oxlint is where the rule is missing.** Oxlint has no cognitive complexity rule. ESLint users already have S3776 in `eslint-plugin-sonarjs`, with the same scores apart from the one case in ADR-0002, and a bare message.

**Biome's API isn't ready to build on.** A Biome plugin would need a second traversal over a different syntax tree, written against a developer-preview API.

## Consequences

- `@oxlint/plugins` is used for its types only, and `oxlint` is the one peer dependency.
- The hints aren't available to ESLint users. Adding ESLint support stays additive: wrap the plugin with `eslintCompatPlugin`, which makes `@oxlint/plugins` a runtime dependency, and run the test suites under ESLint as well. It would need an ADR that supersedes this one.
- Biome support is worth revisiting once its JS plugin API is stable.

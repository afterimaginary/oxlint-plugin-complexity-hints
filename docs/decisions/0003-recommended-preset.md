---
description: The recommended preset enables cognitive-complexity and max-params at 5, and leaves out max-depth, max-statements, complexity and max-lines-per-function.
status: accepted
---

# ADR-0003: The `recommended` preset

## Context

The plugin ships a `recommended` preset so a project can adopt it with one `extends` line. Oxlint has several native rules in the same space: `complexity`, `max-depth`, `max-statements`, `max-lines-per-function` and `max-params`. Each rule in the preset adds diagnostics that an agent will try to act on, so each has to earn its place.

## Decision

The preset enables two rules:

- `complexity/cognitive-complexity` at its default threshold.
- [`max-params`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/max-params.html) with `max: 5`.

It leaves out `max-depth`, `max-statements`, `complexity` and `max-lines-per-function`.

## Rationale

**`max-params` stays because it measures something cognitive complexity cannot.** A long parameter list adds no branching, so it never raises the score, yet it makes every call site harder to read. The fix is mechanical and well understood: group the parameters into an options object. The limit is 5, not lower, because four- and five-parameter functions are common where an options object reads worse, such as geometry helpers and small adapters; from six parameters up, an options object is nearly always the better shape.

**`max-depth`, `max-statements` and `complexity` are redundant.** Cognitive complexity charges extra for each level of nesting, so a deeply nested function already exceeds its threshold. A function with many statements and many branches raises the score too. One with many statements and few branches is the long-but-flat case, and the argument against `max-lines-per-function` below applies to `max-statements` as well. The extra hits a cyclomatic count produces are covered in ADR-0001.

**`max-lines-per-function` fires where splitting is the wrong fix.** A function can be long and still simple. In practice the long-but-flat functions are mostly JSX components, whose length is markup, and factory closures such as `createStore()` that are already built from small inner functions. Telling an agent to split these produces worse code or an ignored diagnostic. A function that is long because it is doing too much almost always branches enough to trip cognitive complexity.

## Consequences

- The preset needs no per-file overrides; test files and components get the same two rules.
- Projects that want a line, depth or statement limit enable the native Oxlint rule themselves.
- Changing a threshold in the preset changes diagnostics for every consumer, so it needs a new ADR that supersedes this one.

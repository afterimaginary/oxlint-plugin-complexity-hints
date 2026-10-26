---
description: Ship one rule, cognitive-complexity, with no cyclomatic-complexity rule and no autofixes or suggestions.
status: accepted
---

# ADR-0001: A single cognitive-complexity rule

## Context

Oxlint already ships the size and branching rules most projects reach for: [`eslint/complexity`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/complexity.html) (cyclomatic complexity), `max-depth`, `max-statements`, `max-lines-per-function` and `max-params`. It has nothing that measures how hard a function is to read, which is what SonarSource's [Cognitive Complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) metric is designed for.

The plugin's main reader is an AI coding agent running Oxlint in a loop. A diagnostic is worth emitting only if the agent can act on it.

## Decision

The plugin ships exactly one rule, `complexity/cognitive-complexity`.

- **No cyclomatic-complexity rule.** Oxlint's `eslint/complexity` already covers it.
- **No autofixes and no suggestions.** The rule reports; it never rewrites code.

## Rationale

Cognitive complexity already scores the functions that a cyclomatic rule flags for good reason: deep nesting and tangled branching both raise it. The hits that only a cyclomatic count produces are mostly flat `switch` statements and long boolean chains. Those read fine, and there is rarely a change that makes them better, so for an agent they cost a loop iteration and produce nothing. Users who want the count anyway can turn on `eslint/complexity`.

Bringing a function's score down means restructuring its control flow: extracting a block, inverting a condition into a guard clause, splitting a responsibility. Each of those is a judgement about naming, boundaries and behavior that a mechanical fix cannot make safely. The rule's job is to say where the complexity is and which change would help; making the change is left to whoever reads the diagnostic.

## Consequences

- The plugin's surface is one rule and its options, which keeps the configuration and documentation small. ADR-0006 adds a command alongside the rule; the rule is still the only one.
- Diagnostics have to carry the fix guidance themselves, in the message text.
- Adding another rule later stays possible and purely additive; it would need its own ADR showing it covers something the existing Oxlint rules do not.

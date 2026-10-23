---
description: Scores match eslint-plugin-sonarjs rule S3776 function for function, except for a function in a branch position, where the rule reports the whitepaper-correct total.
status: accepted
---

# ADR-0002: Scores match SonarJS

## Context

SonarSource's [Cognitive Complexity whitepaper](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) defines the metric in language-neutral terms. JavaScript and TypeScript raise questions it does not settle, such as how to count `??`, JSX and nested arrow functions, so two faithful implementations can disagree on the same code.

The reference JavaScript implementation is rule S3776 in [`eslint-plugin-sonarjs`](https://www.npmjs.com/package/eslint-plugin-sonarjs), which is also what SonarQube reports. It runs under ESLint, not Oxlint.

## Decision

For every function, this rule reports the same score, at the same line and column, as `eslint-plugin-sonarjs` S3776. Where SonarJS departs from the whitepaper, this rule follows SonarJS, with one exception described below.

Differential tests run both implementations over the same sources and fail on any difference. The tests pin the `eslint-plugin-sonarjs` version they compare against.

### Deviations from the whitepaper inherited from SonarJS

Checked against `eslint-plugin-sonarjs` 4.2.0:

| Whitepaper                                                                                                                                                                                                       | SonarJS (and this rule)                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Recursion adds +1.                                                                                                                                                                                               | Recursion is not counted.                                                                                                                                                                        |
| Each sequence of like binary logical operators adds +1.                                                                                                                                                          | Only `&&` sequences count. `\|\|` and `??` never add anything, so `if (a \|\| b)` scores 1 and `a && b \|\| c && d` scores 2.                                                                    |
| A nested function or lambda raises the nesting level, and its increments count toward the enclosing function's total, unless the outer function is purely declarative (has no structural increments of its own). | Every function is scored on its own, starting from nesting zero, and reported separately. Its score is not added to the enclosing function's.                                                    |
| No special case for markup.                                                                                                                                                                                      | Logical operators inside a JSX expression container (`{a && <Item />}`, `<div hidden={a && b} />`) are not counted. The same operator outside JSX, such as `return a && <Item />`, still counts. |

### Where this rule reports the whitepaper total instead

The one exception is a function that sits directly in a branch position. It takes two forms: a function expression used as a ternary branch (`a ? () => a : b`), and, in sloppy-mode scripts, a function declaration used as the body of an `if` or `else`. SonarJS does not restore its nesting level after leaving such a function, so every nesting-sensitive structure that follows in the enclosing function (`if`, ternary, `switch`, loops, `catch`) is scored one level too deep. The error accumulates: each further function in a branch position adds another level. For example, `function f(a) { const x = a ? () => a : a; for (;;) {} }` scores 3 in SonarJS. The whitepaper gives 2: +1 for the ternary and +1 for the `for` at nesting zero.

This rule reports 2. Its differential tests pin the whitepaper totals for both forms and assert that SonarJS still disagrees, so a SonarJS fix shows up as a failing test and the exception can be removed.

## Rationale

Matching SonarJS gives users numbers they already know from SonarQube. A function that scores 18 there scores 18 here, so thresholds and existing refactoring work carry over. It also gives the metric an executable definition: rather than argue about how to count each JavaScript construct, the tests ask SonarJS.

The inherited deviations are judgement calls that SonarSource made on purpose for JavaScript, and they are defensible. For example, `a || b` is mostly a default value, not a branch. Following them costs nothing and keeps scores aligned.

The nesting shape is different. The inflated score is not a policy about what is hard to read; it is state that leaks from one part of a function into unrelated code after it. Copying it would mean reproducing a defect, and a user who sees a loop scored +2 at the top level of a function would rightly report it as a bug.

## Consequences

- The test suite needs ESLint and `eslint-plugin-sonarjs` as development dependencies. They never ship with the package.
- A SonarJS release that changes scoring makes the differential tests fail. Each such change is a deliberate decision: follow it, or record a new exception here.
- SonarJS is the oracle for observable behavior only. The scorer is written from the whitepaper and from observed results, not derived from SonarJS source.

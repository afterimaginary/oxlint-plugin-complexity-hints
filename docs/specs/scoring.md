# Scoring

How `complexity/cognitive-complexity` scores code. This page is the source of truth for what counts; tests and implementation follow it. The metric is SonarSource's [Cognitive Complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf), with the JavaScript deviations recorded in ADR-0002.

## Function units

Each function unit gets its own score:

- function declarations, including `export default function`
- function expressions, including IIFEs, callbacks and object-literal methods
- arrow functions, including class-field arrows
- class methods, accessors and constructors

These are **not** units, and add nothing of their own: the module top level, class bodies, class static blocks, class field initializers, and TypeScript signatures without a body (overloads, `declare function`, abstract methods). Code inside them belongs to the nearest enclosing unit, if any. Code with no enclosing unit is not scored.

## Attribution

An increment belongs to the nearest function unit that lexically contains it, including code in that unit's parameter defaults. A nested function's increments are never added to the enclosing function, and nesting restarts at 0 in every unit.

## Nesting

The nesting level of a node is the number of these boundaries between it and its own unit:

| Structure           | Raises nesting for                                             | Does not raise nesting for                |
| ------------------- | -------------------------------------------------------------- | ----------------------------------------- |
| `if`                | its consequent; its `else` branch, unless that is an `else if` | the condition                             |
| ternary `a ? b : c` | `b` and `c`                                                    | `a`                                       |
| `switch`            | every `case`, including the `case` test                        | the discriminant                          |
| loops               | the body                                                       | the header (init, test, update, iterable) |
| `catch`             | the body                                                       | the parameter                             |

## What counts

| Construct                                                      | Increment       | Notes                                                                                                                                                                                                                                            |
| -------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `if`                                                           | +1 plus nesting |                                                                                                                                                                                                                                                  |
| `else if`                                                      | +1              | No nesting increment.                                                                                                                                                                                                                            |
| `else`                                                         | +1              | No nesting increment.                                                                                                                                                                                                                            |
| ternary `a ? b : c`                                            | +1 plus nesting | A ternary chain is not flattened: `a ? x : b ? y : z` scores +1 and then +2.                                                                                                                                                                     |
| `switch`                                                       | +1 plus nesting | Once per `switch`; `case` and `default` add nothing.                                                                                                                                                                                             |
| `for`, `for…in`, `for…of`, `for await…of`, `while`, `do…while` | +1 plus nesting |                                                                                                                                                                                                                                                  |
| `catch`                                                        | +1 plus nesting |                                                                                                                                                                                                                                                  |
| each run of consecutive `&&`                                   | +1              | Within one chain of logical operators, read left to right. `a && b && c` is +1; `a && b \|\| c && d` is +2. A chain ends at any non-logical node, so `a && !(b && c)` is two chains, +2. Parentheses don't break a chain: `a && (b && c)` is +1. |
| `break label` / `continue label`                               | +1              |                                                                                                                                                                                                                                                  |

## What does not count

- `||` and `??`, including inside a chain with `&&`
- logical assignment: `&&=`, `||=`, `??=`
- recursion
- `try` and `finally`
- `break`, `continue` and `return` without a label
- optional chaining (`a?.b`, `a?.()`)
- TypeScript-only syntax
- the function itself, at any depth

## Deviations from the whitepaper

Taken from `eslint-plugin-sonarjs` and explained in ADR-0002: recursion, `||` and `??` are not counted, and every function is scored on its own. A function that sits directly in a branch position (`a ? () => x : y`, or a sloppy-mode `if (a) function g() {}` or `else function g() {}`) does not change the nesting of the code after it. In that one case scores follow the whitepaper, not sonarjs. `tests/fixtures/branch-position.js` and `branch-position-sloppy.cjs` pin these totals.

## Report location

A unit over the limit is reported once, at:

| Unit                                                                                             | Location                          |
| ------------------------------------------------------------------------------------------------ | --------------------------------- |
| function declaration with a name                                                                 | the name                          |
| method, accessor, constructor, object method, `key: function () {}`                              | the key, including a computed key |
| any other function expression, including a named one, and an anonymous `export default function` | the `function` keyword            |
| arrow function                                                                                   | its `=>`                          |

These match where `eslint-plugin-sonarjs` reports.

## Options

| Option | Type               | Default | Meaning                                          |
| ------ | ------------------ | ------- | ------------------------------------------------ |
| `max`  | integer, 0 or more | `15`    | A unit is reported when its score is over `max`. |

It is given as `{ "max": 20 }` or as a bare number, `20`.

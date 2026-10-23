# Diagnostics

What `complexity/cognitive-complexity` says when a function is over `max`. Scores and report locations are specified in [`scoring.md`](scoring.md).

Oxlint's JS plugin diagnostics have no `help` text and no docs URL, and `--format agent` prints one line per diagnostic with any newline turned into a space. So the message has to be actionable on its own, and it is always one line.

## Format

```
<label> has cognitive complexity <total>, over the max of <max>; main contributors: <contributors>; fix: <fix>.
```

For example:

```
Function 'deep' has cognitive complexity 10, over the max of 0; main contributors: 'if' at line 20 (+4, nested 3 deep), 'while' at line 19 (+3, nested 2 deep), 'for...of' at line 18 (+2, nested 1 deep); fix: move lines 19-22 (the body of the 'for...of' at line 18) into a new function; this one drops to 3 and the new one scores 3.
```

- Semicolons separate the three parts, and commas separate contributors.
- The part `has cognitive complexity <total>, over the max of <max>` is stable. Tooling may match on it.
- The message never contains a newline: see [Function label](#function-label).

## Function label

How the message names the function, so it can be found again in the source:

| Function                                                                 | Label                                      |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| declaration, or named function expression with nothing else naming it    | `Function 'name'`                          |
| bound to a variable: `const f = () => {}`                                | `Function 'f'`                             |
| assigned: `obj.f = function () {}`                                       | `Function 'obj.f'`                         |
| object property that isn't a method: `{ f: () => {} }`                   | `Function 'f'`                             |
| method, getter, setter, object method, or class field holding a function | `Method 'name'`, or `Method 'constructor'` |
| `export default function () {}`, `export default () => {}`               | `Default export function`                  |
| immediately invoked: `(() => {})()`                                      | `Immediately invoked function`             |
| argument to a call or `new`: `items.map(() => {})`                       | `Callback passed to 'map'`, or `Callback`  |
| anything else                                                            | `Anonymous function`                       |

- Names come from identifiers and keys, never from raw source text. An assignment target is its chain of names joined with `.`, such as `this.handlers.click`.
- A computed key or computed part of a target shows as `[computed]`. A private name keeps its `#`. A string key shows its value.
- `Callback passed to` names the last part of the callee (`map` in `items.map`). When the callee is an expression, such as `handlers[0]`, the label is just `Callback`.
- Any run of whitespace in a label becomes one space.

## Contributors

The increments that make up the score, grouped and ranked, heaviest first. At most three are shown; the total already says there is more.

- **Increments with a nesting bonus** are listed one by one: `'if' at line 49 (+5, nested 4 deep)`. Several of the same kind on the same line with the same points merge: `2 '?:' at line 30 (+4, nested 1 deep)`.
- **Increments without one** are grouped by kind, whether flat by nature or at nesting level 0: `'else' at line 9 (+1)`, `4 'if' at lines 5-11 (+4)`, `3 '&&' at lines 42-44 (+4)`. A single `&&` chain with two runs (`(a && b) || (c && d)`) counts as one with +2.
- Ranking is by points, then by first line.

Kinds are named `'if'`, `'else if'`, `'else'`, `'?:'`, `'switch'`, `'for'`, `'for...in'`, `'for...of'`, `'for await...of'`, `'while'`, `'do...while'`, `'catch'`, `'&&'`, `labeled 'break'` and `labeled 'continue'`. An `'else'` is placed on the line of its `else` keyword.

## Fix

Exactly one suggested change. It moves one region of the function into a new function, chosen so that both functions end up scoring less than this one does now.

The candidate regions are:

- the body of any `if`, `else if`, `else` or loop, at any depth, with or without braces
- the `try`, `catch` and `finally` blocks of a `try` that has a `catch`
- the statements of any `case` or `default`, without the unlabeled `break` that ends it
- any run of consecutive statements in the function body, short of the whole body
- any `?:` with a nesting bonus

For each candidate, the rule works out what this function would score without the region, and what the region would score as a function of its own. The region's own nesting goes away: everything in the body of a top-level loop scores one point less once it moves. The rule picks the candidate where the higher of the two scores is lowest, then the one that starts first in the source, then the shortest. A candidate qualifies only if that score is lower than the current total, so repeating the fix always makes progress.

Wording:

| Region         | Fix                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a body or case | `move lines 19-22 (the body of the 'for...of' at line 18) into a new function; this one drops to 3 and the new one scores 3`                                                                            |
|                | other descriptions: `the 'else' branch at line 18`, `the 'case' at line 33`, `the 'default' at line 41`, `the 'try' block at line 49`, `the 'catch' block at line 51`, `the 'finally' block at line 58` |
| statement run  | `move lines 5-8 into a new function; this one drops to 2 and the new one scores 2`                                                                                                                      |
| ternary        | `move the '?:' at line 80, column 43, into a helper function; this one drops to 1 and the helper scores 3`                                                                                              |

Line ranges cover the region's statements, not its braces, and read `line 43` when the region is on one line.

When another construct of the same kind shares its line, a construct is also given its column: `the body of the 'for' at line 105, column 11`.

The numbers assume the region moves unchanged. The hint doesn't yet account for what stands in the way of that: a `return`, `break`, `continue`, `yield` or labeled jump in the region, or a variable declared in the region and used after it, needs extra handling at the call site.

When no candidate qualifies, the fix is worded by the heaviest contributor, at its first line:

| Heaviest contributor | Fix                                                                    |
| -------------------- | ---------------------------------------------------------------------- |
| `'&&'`               | `split the condition at line 84 into named helper functions`           |
| `'else if'`          | `replace the else-if chain at line 90 with a switch or a lookup table` |
| anything else        | `split the code around line 98 into smaller functions`                 |

## Examples

More examples, covering every label, grouping rule and kind of fix, are pinned by the snapshots in `tests/cli.test.ts`, from the fixtures in `tests/fixtures/cli/`.

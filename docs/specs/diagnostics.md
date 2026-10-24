# Diagnostics

What `complexity/cognitive-complexity` says when a function is over `max`. Scores and report locations are specified in [`scoring.md`](scoring.md).

Oxlint's JS plugin diagnostics have no `help` text and no docs URL, and `--format agent` prints one line per diagnostic with any newline turned into a space. So the message has to be actionable on its own, and it is always one line.

## Format

```
<label> has cognitive complexity <total>, over the max of <max>; main contributors: <contributors>; fix: <fix>.
```

For example:

```
Function 'deep' has cognitive complexity 10, over the max of 0; main contributors: 'if' at line 20 (+4, nested 3 deep), 'while' at line 19 (+3, nested 2 deep), 'for...of' at line 18 (+2, nested 1 deep); fix: invert the 'if' at line 17 into a guard clause that returns early, so its body moves up a level; this one drops to 7.
```

- Semicolons separate the three parts, and commas separate contributors.
- The part `has cognitive complexity <total>, over the max of <max>` is stable. Tooling may match on it.
- The message never contains a newline: see [Function label](#function-label).
- Every position in it is worded `line N`, `lines N-M` or `line N, column M`, counted in the file. See [Embedded scripts](#embedded-scripts).

## Embedded scripts

Oxlint lints each script block of a `.vue`, `.svelte` or `.astro` file (and Astro's frontmatter) on its own, and the rule sees only that block. Oxlint corrects the diagnostic's location, so the rule corrects the positions in the message to match: it finds the block's text in the file on disk and adds the lines before it. A column on the block's first line also gets the columns before it on that line, such as those of `<script>`.

- When the file can't be read or no longer contains the block, as with an unsaved editor buffer, positions stay relative to the block.
- When only the markup around the block has unsaved changes, the block is still found, at its saved position, so the message's positions can be off from the location until the file is saved.
- A block whose text also appears earlier in the file, such as two identical blocks, maps to where it first appears.
- Other files are linted whole, so their positions are never changed.

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

Exactly one suggested change, which always lowers the score: a guard clause when one saves points, and otherwise moving one region of the function into a new function. A guard comes first because it removes complexity rather than moving it, and it is a small edit that skips no code. Once no guard helps, the next diagnostic suggests a move.

When another construct of the same kind shares its line, a construct is also given its column: `the body of the 'for' at line 105, column 11`.

### Guard clause

Inverting an `if` into `if (!test) return;` or `if (!test) continue;` lifts everything in its body one level, so it saves one point for each increment there that takes a nesting bonus.

The rule starts from the increment to attack first: the deepest nesting, then the most points, then the earliest line. Of the `if`s that hold that increment, including the increment itself, it picks the outermost one that qualifies, which saves the most. A guard is suggested only when it saves at least one point.

An `if` qualifies only when returning or continuing early would skip nothing:

- it has no `else` and is the last statement of its block;
- every enclosing block likewise ends at its owner, through `if`s without an `else`, up to a function body (`return`) or a loop body (`continue`), with or without braces;
- an `else`, `else if`, `switch`, `try`, label or following statement anywhere on that path rules it out.

Moving the body up a level also moves its declarations into the enclosing block, so a `let`, `const`, `class` or function declared there can clash with a name the enclosing block already declares. The hint doesn't check for that yet.

Wording: `invert the 'if' at line 12 into a guard clause that returns early, so its body moves up a level; this one drops to 19`, or `… that continues to the next iteration early, …` in a loop body.

### Moving a region

A move is chosen so that both functions end up scoring less than this one does now.

The candidate regions are:

- the body of any `if`, `else if`, `else` or loop, at any depth, with or without braces
- the `try`, `catch` and `finally` blocks of a `try` that has a `catch`
- the statements of any `case` or `default`, without the unlabeled `break` that ends it
- any run of consecutive statements in the function body, short of the whole body
- any `?:` with a nesting bonus

For each candidate, the rule works out what this function would score without the region, plus whatever the workaround for its [obstacles](#obstacles) adds back, and what the region would score as a function of its own. The region's own nesting goes away: everything in the body of a top-level loop scores one point less once it moves. The rule picks the candidate where the higher of the two scores is lowest, then the one with fewer obstacles, then the one that starts first in the source, then the shortest. A candidate qualifies only if that score is lower than the current total, so repeating the fix always makes progress.

Wording:

| Region         | Fix                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a body or case | `move lines 19-22 (the body of the 'for...of' at line 18) into a new function; this one drops to 3 and the new one scores 3`                                                                            |
|                | other descriptions: `the 'else' branch at line 18`, `the 'case' at line 33`, `the 'default' at line 41`, `the 'try' block at line 49`, `the 'catch' block at line 51`, `the 'finally' block at line 58` |
| statement run  | `move lines 5-8 into a new function; this one drops to 2 and the new one scores 2`                                                                                                                      |
| ternary        | `move the '?:' at line 80, column 43, into a helper function; this one drops to 1 and the helper scores 3`                                                                                              |

Line ranges cover the region's statements, not its braces, and read `line 43` when the region is on one line.

#### Obstacles

Some code can't move into a new function unchanged. The hint names each such obstacle and its standard workaround, as a clause between the region and the scores:

```
move lines 28-30 (the body of the 'if' at line 27) into a new function; it returns from this function on some paths, so have it return the result or undefined, and return that from the caller when it is defined; this one drops to 6 and the new one scores 7
```

Control flow (code inside nested functions doesn't count):

| Obstacle                                      | Clause                                                                                                                                       | Adds to this function        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| a `return` on every path, with a value        | `it returns from this function, so return its result from the caller`                                                                        | 0                            |
| a `return` on every path, without one         | `it returns from this function, so call it and then return`                                                                                  | 0                            |
| a `return` on some paths, with a value        | `it returns from this function on some paths, so have it return the result or undefined, and return that from the caller when it is defined` | an `if`                      |
| a `return` on some paths, without one         | `it returns from this function on some paths, so have it return whether to stop, and return from the caller when it does`                    | an `if`                      |
| a `break` out of a loop or `switch` around it | `it breaks out of the 'for' at line 66, so have it return whether to break, and break from the caller when it does`                          | an `if`                      |
| a `continue` of a loop around it              | `it continues the 'for...of' at line 79, so have it return whether to continue, and continue from the caller when it does`                   | an `if`                      |
| a labeled `break` or `continue`               | `it breaks to 'outer', so have it return whether to break, and break outer from the caller when it does`                                     | an `if` and the labeled jump |
| `await`                                       | `it awaits, so make it async and await it`                                                                                                   | 0                            |
| `yield`                                       | `it yields, so make it a generator and yield* its result`                                                                                    | 0                            |

- A `return` counts as on every path only when the region can't fall off its end and has no `break` or `continue` that leaves or ends it. Loops, labels and `try` aren't followed, so a `return` inside them counts as on some paths.
- A `return` without a value includes `return undefined` and `return void …`. A `return` whose value can be `undefined` at run time still gets the "or undefined" workaround, so the caller can't tell it from no return; check such a case by hand.
- A jump to a loop, `switch` or label inside the region stays inside. Continuing the loop whose body the region is, or breaking out of the `switch` whose case it is, just ends the region, so it becomes a plain `return`: no obstacle. Breaking out of the region's own loop is an obstacle, since the caller still has to stop the loop.
- The added `if` sits at the call site, where the region was, so it scores 1 plus the region's nesting level. A labeled jump at the call site adds 1 more (none is needed when an unlabeled jump in the region reaches the same target), and each labeled jump that leaves the region scores 1 less in the new function, where it becomes a `return`.

Variables, other than module-level and global ones:

| Obstacle                                                  | Clause                                                                                                                                                               |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| reassigned in the region, and the new value is read later | `it reassigns 'count', which the code around it reads, so have it return the new 'count' and assign it from the call`                                                |
| declared in the region, and used after it                 | `it declares 'found', which the code after it uses, so declare 'found' before line 255, have it return 'found', and assign it from the call`                         |
| both                                                      | `it reassigns 'a' and declares 'x', which the code around it reads, so declare 'x' before line N, have it return the new 'a' and 'x', and assign them from the call` |

- A new value is read later when it is read after the region, by a closure anywhere, or anywhere inside a loop that encloses the region within the variable's scope (on the next pass). A variable of an enclosing function is always taken as read, since this function can run again.
- A declared name goes before the statement that holds the region, in the innermost statement list that also holds every use of the name.
- When the region returns on every path, the code after it never runs: only a new value that a closure or an enclosing function reads is an obstacle, and a variable it declares that is used elsewhere rules the region out.
- Names are listed in source order, at most three, then `and N more`.

Clauses for several obstacles are joined with `, and `. The obstacle count used to break ties is the number of clauses.

A region is not suggested when there is no standard way around what's in it:

- the new function would have to hand back two things: a `return` (on some paths, or on every path with a value), a `break` or `continue`, and changed variables each need its return value;
- its `break`s and `continue`s don't all have the same kind and target;
- its returns on some paths mix values with no values;
- a closure created in it writes a variable from outside it, or one it declares that is used after it;
- a variable it declares is used before it (hoisting);
- a `using` declaration in it would be disposed earlier once moved (in a case, or a statement run short of the end of the body);
- it is a `?:` whose variables would need handing back, since its helper already returns its value.

Not handled: `this`, `super`, `arguments` and `new.target` in the region.

#### Statement runs

A function with many top-level statements has many runs. A run's score before obstacles is just its points, and obstacles can only add one point to it, so only runs at the lowest score or one above it can be chosen. Of each, the first 64 are analysed for obstacles, shortest first; a very long function may get a good rather than the best run, or none when every analysed run is ruled out.

### Fallback

When no guard or region qualifies, the fix is worded by the heaviest contributor, at its first line:

| Heaviest contributor | Fix                                                                    |
| -------------------- | ---------------------------------------------------------------------- |
| `'&&'`               | `split the condition at line 84 into named helper functions`           |
| `'else if'`          | `replace the else-if chain at line 90 with a switch or a lookup table` |
| anything else        | `split the code around line 98 into smaller functions`                 |

## Examples

More examples, covering every label, grouping rule and kind of fix, each case that allows or rules out a guard clause, and each obstacle to a move, are pinned by the snapshots in `tests/cli.test.ts`, from the fixtures in `tests/fixtures/cli/`.

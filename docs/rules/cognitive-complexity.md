# `complexity/cognitive-complexity`

Reports a function whose cognitive complexity is over `max`, with a one-line message that says where the complexity comes from and one change that would lower it.

Cognitive complexity is SonarSource's measure of how hard a function is to read, defined in their [whitepaper](https://www.sonarsource.com/docs/CognitiveComplexity.pdf). Each break in the linear flow of the code adds a point, and a break nested inside another adds more. Scores match [`eslint-plugin-sonarjs`](https://www.npmjs.com/package/eslint-plugin-sonarjs) rule S3776, and so SonarQube, function for function, with [one exception](#deviations-from-the-whitepaper).

## Options

| Option | Type               | Default | Meaning                                              |
| ------ | ------------------ | ------- | ---------------------------------------------------- |
| `max`  | integer, 0 or more | `15`    | A function is reported when its score is over `max`. |

```json
{ "rules": { "complexity/cognitive-complexity": ["error", { "max": 20 }] } }
```

A bare number works too: `["error", 20]`.

## What counts

<!-- prettier-ignore -->
```js
function findUser(users, query) {
  for (const user of users) {             // +1
    if (user.active && user.verified) {   // +2 (nested 1 deep), +1 for the &&
      if (user.name === query) {          // +3 (nested 2 deep)
        return user;
      } else if (user.email === query) {  // +1
        return user;
      }
    }
  }

  return query.fallback ?? null;          // ?? adds nothing
}
// Total: 8
```

| Construct                                                 | Adds                |
| --------------------------------------------------------- | ------------------- |
| `if`, ternary `?:`, `switch`, every kind of loop, `catch` | 1, plus its nesting |
| `else if`, `else`                                         | 1                   |
| each run of consecutive `&&`                              | 1                   |
| `break label`, `continue label`                           | 1                   |

The nesting is how many of those structures enclose the construct within its own function. A `switch` adds once, however many `case`s it has.

These add nothing:

- `||`, `??` and logical assignment (`&&=`, `||=`, `??=`)
- `try`, `finally`, and `break`, `continue` or `return` without a label
- recursion and optional chaining
- TypeScript-only syntax, such as types, interfaces, enums and `as`
- conditional rendering in JSX, such as `{loading && <Spinner />}`

Every function is scored on its own, starting at nesting zero, including callbacks and functions nested in other functions. A nested function's score is never added to the one around it.

The full rules, including how chains of `&&` are split and what counts as a function, are in the [scoring spec](../specs/scoring.md).

## Deviations from the whitepaper

The JavaScript ones that `eslint-plugin-sonarjs` makes, so SonarQube numbers carry over:

| Whitepaper                                                                                    | This rule                                                                 |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Recursion adds 1.                                                                             | Recursion adds nothing.                                                   |
| Each run of like logical operators adds 1.                                                    | Only `&&` runs add; `\|\|` and `??` are mostly default values.            |
| A nested function raises the nesting, and its increments count toward the enclosing function. | Every function is scored and reported on its own.                         |
| No special case for markup.                                                                   | `&&` for conditional rendering, as in `{open && <Menu />}`, adds nothing. |

The one place this rule differs from `eslint-plugin-sonarjs`: a function used directly as a branch, as in `a ? () => x : y`. SonarJS scores everything after it in the enclosing function one level too deep. This rule follows the whitepaper there. The reasoning is in ADR-0002.

## Why not cyclomatic complexity

Cyclomatic complexity, which Oxlint's [`complexity`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/complexity.html) rule measures, counts the paths through a function. That's a good measure of how many tests it needs, but not of how hard it is to read, because every branch costs the same wherever it is:

<!-- prettier-ignore -->
```js
function statusLabel(status) {            // cyclomatic 6, cognitive 1
  switch (status) {
    case "draft":
      return "Draft";
    case "review":
      return "In review";
    case "approved":
      return "Approved";
    case "published":
      return "Published";
    case "archived":
      return "Archived";
    default:
      return "Unknown";
  }
}

function firstOverdue(projects, today) {  // cyclomatic 5, cognitive 10
  for (const project of projects) {
    for (const task of project.tasks) {
      if (!task.done) {
        if (task.due < today) {
          return task;
        }
      }
    }
  }

  return null;
}
```

`statusLabel` reads at a glance, and there is nothing to fix. `firstOverdue` makes the reader hold four levels of context at once. Cyclomatic complexity rates `statusLabel` as the more complex of the two; cognitive complexity scores `firstOverdue` ten times higher. A threshold that fires on flat `switch`es and long lists of conditions sends an agent off to "fix" code that is fine, which is why the plugin has no cyclomatic rule (ADR-0001). If you want the count anyway, turn on Oxlint's `complexity` rule.

## The `recommended` preset

The preset turns on two rules:

| Rule                              | Setting                   | Why                                                                                                                     |
| --------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `complexity/cognitive-complexity` | `"error"`, at `max` 15    | This rule.                                                                                                              |
| `max-params`                      | `["error", { "max": 5 }]` | A long parameter list adds no branching, so this rule can't see it, and the fix, an options object, is well understood. |

It leaves out Oxlint's `complexity`, `max-depth`, `max-statements` and `max-lines-per-function`: cognitive complexity already catches the deeply nested and the heavily branching functions those rules find, and the long-but-flat functions that only a length limit catches are mostly components and factories, where splitting makes the code worse. The reasoning is in ADR-0003.

To change the threshold, extend the preset and set the rule again; the later setting wins.

## The message

```
Function 'findUser' has cognitive complexity 8, over the max of 5; main contributors: 'if' at line 4 (+3, nested 2 deep), 'if' at line 3 (+2, nested 1 deep), 'for...of' at line 2 (+1); fix: move lines 3-9 (the body of the 'for...of' at line 2) into a new function; it returns from this function on some paths, so have it return the result or undefined, and return that from the caller when it is defined; this one drops to 3 and the new one scores 5.
```

- **The function**, named so it can be found again, and its score against `max`. The part `has cognitive complexity N, over the max of M` is stable, so tooling can match on it.
- **Main contributors**: the three heaviest increments, with their lines and points.
- **Fix**: one change, and the score it reaches. Inverting an `if` into a guard clause comes first when that alone brings the function to the max, because it removes complexity without moving code; a guard that isn't enough is suggested only when no move leaves a lower score. Otherwise it names a block of lines to move into a new function, the score each function ends up with, and how to work around anything that stops the code moving unchanged, such as a `return` or a variable the code around it reads. When neither qualifies, it gives a general direction instead, such as splitting the code around a line into smaller functions.

The message is always one line, because Oxlint gives a plugin's diagnostic no help text and its `agent` format prints one line per diagnostic. In `.vue`, `.svelte` and `.astro` files, its line numbers count from the top of the file, like the diagnostic's location.

The diagnostic is reported where `eslint-plugin-sonarjs` reports it: at a declaration's name or a method's key, and otherwise at the `function` keyword or the `=>`. The [diagnostics spec](../specs/diagnostics.md) has the exact format.

How the hints do on real code, including whether each fix reaches the scores it promises, is in the [hint evaluation](../evaluation/hints.md), and how the choice between a guard clause and a move affects the rounds to reach the max is in the [strategy simulation](../evaluation/strategies.md).

The rule has no autofix and no suggestions: lowering a score takes judgement about names and boundaries that a mechanical fix can't make safely.

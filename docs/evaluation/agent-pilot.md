# Agent pilot

Does a coding agent fix an over-complex function better with this rule's message than with a bare score? This pilot gave Claude Sonnet 5.5 the same 44 functions under each message, once each. The [hint evaluation](hints.md) and the [simulation](strategies.md) apply the hints mechanically; this is the only evidence here with an agent in the loop.

It's a pilot: one run per function and message, on one kind of task. It shows direction, not effect sizes to quote.

## Setup

- **Tasks.** Functions over the max of 15 in ESLint v9.0.0's `lib/rules/`, picked with no model involved. A function qualified when it was the only one over the max in its file, its rule's tests passed, and the tests failed when its body was emptied. 44 qualified; 8 files with more than one function over the max were left out.
- **Messages.**
  - **A, bare:** SonarJS S3776's wording, "Refactor this function to reduce its Cognitive Complexity from N to the 15 allowed."
  - **B, this rule:** the message as it shipped at the time, with the main contributors and one fix with the score it reaches, under the "guard first" strategy.

  Both were registered as the same rule, at the same path and config, so nothing in the tree told the agent which it had.

- **Agent.** Claude Sonnet 5.5 through the Claude Agent SDK 0.3.310 (Claude Code 2.1.310), at effort `high`, funded by the API. Tools: Read, Edit, Write, Bash, Glob and Grep. Bash ran in Claude Code's sandbox with no network. The README's lint hook was installed.
- **Prompt.** The same for both, apart from the diagnostics it quotes:

  > `npx oxlint --format agent lib/rules/<rule>.js` reports this: _the diagnostics_. Fix it without changing what the rule does. Keep the max where it is, and don't add `oxlint-disable` or `eslint-disable` comments. The rule's tests are in `tests/lib/rules/<rule>.js`; run them with `npx mocha tests/lib/rules/<rule>.js`.

- **Success.** The function and anything the run wrote are at or under the max; the rule's tests pass; the run changed only the target file, or added files under `lib/rules/`, and added no disable directives; and the rule behaves the same as the original. Behaving the same means identical reports and fixes under every option set its tests use, on its test cases, ESLint's own code and Prettier 3.0.0's `src/`.

## Results

All 88 runs succeeded. They took 3 to 7 turns, at most $0.11 each, and $4.09 in all.

| Per run, mean                      |      A |      B |
| ---------------------------------- | -----: | -----: |
| Success                            |   100% |   100% |
| Cost                               | $0.048 | $0.045 |
| Turns                              |   4.23 |   4.27 |
| Lines changed, ignoring whitespace |   86.8 |   78.5 |
| Lines changed, with whitespace     |  111.1 |   99.3 |
| Functions added                    |   2.52 |   2.11 |

B − A, averaged over tasks, with 95% bootstrap intervals over tasks and runs:

| B − A                              | Estimate | 95% interval     |
| ---------------------------------- | -------: | ---------------- |
| Cost per run                       |  −$0.003 | [−0.006, −0.001] |
| Lines changed, ignoring whitespace |     −8.3 | [−15.7, −1.2]    |
| Lines changed, with whitespace     |    −11.8 | [−22.8, −1.7]    |
| Turns                              |    +0.05 | [−0.36, +0.46]   |

By the kind of the first hint, lines changed: −12.0 [−21.8, −2.5] on the 32 tasks whose hint was a move, and +1.8 [−1.5, +5.1] on the 12 whose hint was a guard clause.

## What it shows

- **These tasks are too easy to separate the messages on success.** Handed the diagnostic and asked to fix it, Sonnet rewrote the function in one pass under either message. What differed was the size of the change: with this rule's message, changes were about a tenth smaller, all of it on tasks whose hint was a move, and runs cost slightly less.
- **A guard clause that isn't enough on its own isn't taken as the fix.** On the 8 tasks where guard first suggests a guard that leaves the function over the max, and guard if enough would suggest a move, agents given the guard still extracted 1 to 4 functions, as many as with a bare score. The pilot gives no reason to keep suggesting such guards, which supports shipping guard if enough on the simulation's evidence (#43).
- **An edit hook misses many edits.** 54 of the 88 runs edited the file only through Bash, mostly with a script that rewrote it; 31 used only Edit, and 3 both. The README's hook runs after Edit and Write, so it ran in only 34 runs, and agents ran `npx oxlint` themselves to check their work. How and when the lint reaches the agent matters as much as what it says (#44, #45).

## Limits

- **One run per task and message.** The intervals are over tasks, with little to say about how much a task's runs vary.
- **One kind of task.** Fixing a lint error on request doesn't exercise the lint loop during feature work, or keeping a change within its scope. A benchmark on feature tasks is #53.
- **The behavior check isn't proof.** Some rules catch bugs real code rarely has, and report on almost nothing outside their tests: 11 of the 44 report on at most one corpus check. For those, success rests mostly on the tests.
- **One model, on one code base,** which is likely in its training data, equally for both messages.
- **The harness was still being hardened.** Three sessions ran at a time; the caps were 100 turns and $5, which no run came near; and the plugin bundle held a table naming the arms, which no run read. Every run was scored again with the final scoring code, from snapshots taken after each tool call, and all 88 still succeeded.

## Reproducing it

The harness is at the tag `agent-benchmark-pilot`, in `scripts/agent-benchmark/`, with its design in `docs/designs/agent-benchmark.md`, and isn't on the main branch. These 88 runs are what the design calls the uncounted probe; the counted runs it plans were dropped for the reasons above, in favor of #53. The harness was hardened after these runs: it runs sessions one at a time, at caps of 25 turns and $0.50, and its plugin bundles no longer name the arms, so it doesn't rebuild these runs' bundles byte for byte. The run records, which hold every message and a snapshot after every tool call, aren't published.

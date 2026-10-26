# Agent benchmark

The hint evaluation ([hints.md](../evaluation/hints.md)) checks that each fix reaches the scores it states, and the simulation ([strategies.md](../evaluation/strategies.md)) follows the hints mechanically. Neither involves an agent. This benchmark asks whether a coding agent, given this rule's message, does better than with a bare score: whether it reaches the max with the code still behaving the same, how much it spends, and how much it changes.

Everything below is fixed before any counted run: tasks, arms, prompt, scoring and analysis. Every run keeps its full message stream and a snapshot of the tree after every tool call, so a later question can be answered from the records instead of a new run.

The code is in `scripts/agent-benchmark/`.

## Questions

1. **Primary: does the hint help?** This rule's message (main contributors, a concrete fix and the score it reaches) against a bare score, with Sonnet 5.5.
2. **Secondary: which strategy should ship?** Guard first against guard if enough, on the tasks where their first hints differ.
3. **Exploratory: a smaller model.** The same comparison with Haiku 5.5, reported without claims.

## Tasks

The tasks are functions over the max in ESLint v9.0.0's `lib/rules/`, at the commit pinned in `scripts/eval-repos.mjs`. Each rule has its own RuleTester file, which runs in about a second. `tasks.mjs` picks them, with no model involved. A function is a task when:

- it is the only function in its file over the max of 15, so "the file lints clean" means the task is done;
- its rule's tests pass before any change;
- its tests fail when the function's body is emptied, so they can notice a broken function.

| Set       | Tasks | What it is                                                |
| --------- | ----: | --------------------------------------------------------- |
| Split     |     8 | the first hints of guard first and guard if enough differ |
| Same-hint |    36 | the strategies give the same first hint                   |
| Excluded  |     8 | files with more than one function over the max            |

The split tasks are run first. The same-hint tasks are drawn with a fixed seed. Scores fall in three bands (16–20, 21–30, over 30), and the draw takes one from each band in turn, so a cut anywhere in the list keeps the mix. `tasks.json` holds the order, the seed, and the hashes of everything a run depends on.

## Arms

| Arm                | Message                                                                                                        | Tasks                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| A: bare            | SonarJS S3776's wording: "Refactor this function to reduce its Cognitive Complexity from N to the 15 allowed." | all                            |
| B: guard first     | this rule's message, as it ships                                                                               | all                            |
| C: guard if enough | this rule's message under "guard if enough"                                                                    | split only (elsewhere it is B) |

Every arm registers the same rule, `complexity/cognitive-complexity`, under the same config. `arm-plugin.ts` is bundled once per arm into a single file, which each run copies to the same path, `.oxlint/complexity.mjs`. No path, name or config tells the agent which arm it is in, and edits to this repository during a benchmark can't change a run's plugin.

## A run

`run-agent.mjs` runs one Claude Agent SDK session (version pinned in `package.json`):

- **Tree.** A fresh clone of the base commit, with ESLint's dependencies installed from `eslint-package-lock.json` and linked in read-only. The tree also holds:
  - Oxlint, at this repository's version;
  - an `.oxlintrc.json` that loads the plugin;
  - the README's lint hook, verbatim, in `.claude/settings.json`. `prepare.mjs` reads it from the README.
- **Session.** Claude Code's own system prompt, with these tools: Read, Edit, Write, Bash, Glob and Grep. Excluded:
  - the web tools, subagents and MCP servers;
  - user settings, memory and connectors.

  Only the tree's project settings load.

- **Environment.** The session's environment is built from nothing, so nothing from the shell that starts it reaches the agent. An API key is passed only on API-funded runs, and Claude Code's credential scrub (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`) removes it from the agent's commands and the hooks. The scrub rules out bypassing permissions, so the six tools are approved by name. The run checks the session's reported key source, model and tools before it starts, and aborts if any differ; a run whose records contain the key stops the benchmark.
- **Isolation.**
  - Bash runs in Claude Code's sandbox, with no network and no way to leave it. Reads of this repository and Claude's config are denied.
  - The file tools are denied any path outside the tree.
  - The sandbox and the hooks were checked on the subscription: a `curl` was blocked and a read of `/etc/hosts` was denied.
- **Prompt.** The same for every arm except the diagnostics it quotes, which are the arm's own lint output for the file:

  > `npx oxlint --format agent lib/rules/<rule>.js` reports this:
  >
  > _the arm's diagnostics_
  >
  > Fix it without changing what the rule does. Keep the max where it is, and don't add `oxlint-disable` or `eslint-disable` comments. The rule's tests are in `tests/lib/rules/<rule>.js`; run them with `npx mocha tests/lib/rules/<rule>.js`.

- **Records.** Each run keeps:
  - every SDK message, hook events included;
  - a commit to a separate snapshot repository after every tool call, including edits made through Bash;
  - the final diff.

## What counts

`score.mjs` scores the final tree. `benchmark.mjs selftest` checks the scoring on scripted edits:

- leaving the file unchanged;
- adding a disable comment that silences the rule;
- editing the test file;
- changing the rule's behavior;
- applying the guard hint, both short of the max and reaching it.

**A success** meets all of these:

1. **The max:** the target file, and every other source file the run wrote, has no function over 15.
2. **The tests:** the rule's tests pass.
3. **Integrity:**
   - the run changed only the target file and added only files under `lib/rules/`;
   - it added no disable comments.
4. **Behavior:** `behavior-worker.cjs` runs the original and the edited rule under every option set the test file uses. It runs them on every test case's code and on ESLint's `lib/` and `tests/fixtures/`, and their reports and fixes must match. This catches a deleted branch the tests don't cover.

**Outcomes:**

- `success`, `error_max_turns` and `error_max_budget_usd` are the model's. A cap counts as a failure.
- Service errors, crashes and refusals are the service's. Those runs are run again once, with the same settings, and listed.

**Measures, for every run:**

- cost and tokens, including cache writes by lifetime;
- turns, tool calls and lint runs;
- lines added and removed, ignoring whitespace;
- functions added;
- the highest score left;
- the subscription's reported usage, when there is one.

## Analysis

The unit is the task. A task's runs under each arm are averaged first. Intervals are 95% bootstraps: tasks are resampled, then runs within each task, 10,000 times, with a fixed seed.

**Primary claim (B against A, Sonnet).** The hint helps if both hold:

- success isn't worse: the lower bound of B − A's success rate is at least −0.10;
- B is cheaper or changes less: the upper bound of B − A on cost per run, or on lines changed, is below 0.

Cost and lines changed are averaged over **all** runs, so a run that gives up early can't look cheap. Figures over successful runs only are reported too, but don't count towards the claim. The results are also broken out by the kind of first hint (guard or move), as a description.

**Strategy (C against B, split tasks).** Guard if enough ships unless the upper bound of C − B's success rate is below 0. Eight tasks give this test little power, and the results say so.

**Reporting.** Every cell, every failed run with its reason, the re-runs and the cap hits are reported. A null or negative result is reported as it is.

## Running it

**Stages:**

1. **Build.** Done.
2. **Check runs.** 18 runs on the subscription confirmed the hooks, the sandbox and the records, and found bugs in the harness that are fixed. A probe block on the API, A and B on all 44 tasks with Sonnet, set the caps. None of these runs count.
3. **Freeze.** Commit the protocol, the tasks, the caps and the bundle hashes.
4. **Counted runs.**

**Caps.** 25 turns and $0.50 per run. In the probe the most any run took was 7 turns and $0.11, so a cap stops only a run that has gone wrong.

**Blocks.** Counted runs go in blocks, each one run of every cell, shuffled within the block with a fixed seed. Sonnet's blocks hold A and B on every task and C on the split tasks, 96 runs, so C runs under the same conditions as the B it's compared with. Haiku's blocks hold A and B. The runs planned:

| Model      | Blocks | Runs | About |
| ---------- | -----: | ---: | ----: |
| Sonnet 5.5 |      5 |  480 |   $22 |
| Haiku 5.5  |      3 |  264 |    $2 |

Before each block, the runner continues only if the block's cost fits what is left, at the observed mean cost per run plus 25%. Running out of budget therefore always stops at the end of a block. A block that stops part-way, for an account error such as running out of credit, isn't counted.

## What the probe showed

These are the uncounted probe's numbers, recorded here because they shaped the plan, not as results.

- **Success is at the ceiling.** Every one of the 88 runs succeeded, under both arms. The counted runs are unlikely to separate the arms on success, so the claim rests on cost and lines changed, as the analysis already allows.
- **Agents mostly edit through Bash.** Sonnet often rewrote the file with one script and ran `npx oxlint` and the tests itself, so the hook, which runs after Edit and Write, fired in only some runs. The hint reaches the agent through the prompt and through the lint runs it starts. The snapshots record every step either way.

## Limits

- **ESLint is likely in the models' training data.** That applies equally to every arm.
- **The behavior check isn't proof.** It covers the test file's option sets on ESLint's own code and test cases. A rule that rarely reports on that code, such as `valid-typeof`, gets a weaker check. Each run records how many of the checks reported anything.
- **Oxlint's default rules also run in the hook.** They report things such as unused variables in half-finished edits. They are the same for every arm.

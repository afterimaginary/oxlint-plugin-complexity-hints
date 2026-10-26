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

Every arm registers the same rule, `complexity/cognitive-complexity`, under the same config. Each arm's plugin is bundled into a single file, which each run copies to the same path, `.oxlint/complexity.mjs`. A bundle's entry holds only the arm's rule: the bare one, or this rule under the arm's strategy. No path, name, config or bundle tells the agent which arm it is in.

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

- **Environment.** The session's environment is built from nothing, so nothing from the shell that starts it reaches the agent. On API-funded runs, which all counted runs are, the session's home is an empty folder of the run's own, so the user's name, git identity and dotfiles are out of reach; the subscription's login needs the real one. An API key is passed only on API-funded runs, read from a file under `~/.config`, which the sandbox denies, and Claude Code's credential scrub (`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB`) removes it from the agent's commands and the hooks. The scrub rules out bypassing permissions, so the six tools are approved by name. The run checks the session's reported key source, model and tools before it starts, and aborts if any differ; a run whose records contain the key stops the benchmark.
- **Isolation.**
  - Runs go one at a time, so they can't see or slow each other.
  - Bash runs in Claude Code's sandbox, with no network and no way to leave it. Reads are denied of:
    - this repository, and Claude's and the user's config;
    - the plugins and the behavior check's corpus and results;
    - the base tree's sources, and every other run's tree and records.
  - The file tools are denied any path outside the tree.
  - Bash can write to the tree, its npm cache, Claude Code's own temp folder and `/tmp`. The benchmark's own files are in a folder outside all of these: `/Users/Shared/complexity-agent-benchmark` on macOS, whose path doesn't name the user and which the system's temp cleanup leaves alone.
  - Agents often write scripts to `/tmp` under fixed names. Files a run's tool calls name, and that it created or rewrote, are moved into its records, so the next run can't read them.
  - The sandbox and the hooks were checked on the subscription: a `curl` was blocked and a read of `/etc/hosts` was denied.
- **Prompt.** The same for every arm except the diagnostics it quotes, which are the arm's own lint output for the file. A run checks that the prompt quotes the arm's message exactly as `tasks.json` records it:

  > `npx oxlint --format agent lib/rules/<rule>.js` reports this:
  >
  > _the arm's diagnostics_
  >
  > Fix it without changing what the rule does. Keep the max where it is, and don't add `oxlint-disable` or `eslint-disable` comments. The rule's tests are in `tests/lib/rules/<rule>.js`; run them with `npx mocha tests/lib/rules/<rule>.js`.

- **Records.** Each run keeps:
  - every SDK message, hook events included;
  - a commit to a separate snapshot repository after every tool call that runs, failed ones included, and one more when the session ends. A call the tool rejects before running, such as an Edit whose old and new text are the same, changes nothing and has no snapshot. A command that edits the file and then exits non-zero still edited it, and the final commit is what's scored;
  - the final diff, and anything it left in `/tmp`.

  The snapshots' own git ignores the user's git config, and ESLint's `.gitignore` still applies, so files it ignores aren't in them; a run that adds one fails integrity. The snapshots build on one copy of the base tree's objects, kept beside the results, so the results folder holds everything needed to rebuild any step.

## What counts

`score.mjs` scores the final tree. `benchmark.mjs selftest` checks the scoring on scripted edits:

- leaving the file unchanged;
- adding a disable comment that silences the rule;
- re-indenting text that already mentions a disable comment, which is allowed;
- editing the test file;
- changing the rule's behavior where its tests catch it, and where only the behavior check does;
- leaving the file unparseable;
- a rule that prints while it runs, which is allowed;
- adding a file ESLint's `.gitignore` ignores;
- applying the guard hint, both short of the max and reaching it.

**A success** meets all of these:

1. **The model finished.** The session ended on its own, not at a cap.
2. **The max:** the target file, and every other source file the run wrote, parses and has no function over 15.
3. **The tests:** the rule's tests pass.
4. **Integrity:**
   - the run changed only the target file and added only files under `lib/rules/`, including files ESLint's `.gitignore` ignores;
   - no file it wrote has more disable directives than before. Directives are comments that start with one, so moving an existing comment that mentions one doesn't count.
5. **Behavior:** `behavior-worker.cjs` runs the original and the edited rule under every option set the test file uses, and their reports and fixes must match. It runs them on:
   - every test case's code;
   - ESLint's `lib/` and `tests/fixtures/`;
   - Prettier 3.0.0's `src/`, which ESLint doesn't lint itself with, so rules ESLint enforces on its own code still find something to report.

   Code that doesn't parse is left out, since no rule runs on it. This catches a deleted branch the tests don't cover.

The tests and the behavior check have time limits, of 5 and 30 minutes; a rule left looping fails. They run with an environment that holds only `PATH`, and the behavior check drops anything the edited rule prints. An error in the scoring itself doesn't lose a run: the run is kept, marked, and scored again once the error is fixed.

**Outcomes:**

- `success`, `error_max_turns` and `error_max_budget_usd` are the model's. A cap counts as a failure.
- Service errors, crashes and refusals are the service's. Those runs are run again once, with the same settings, and listed.

**Measures, for every run:**

- cost and tokens, including cache writes by lifetime;
- turns, tool calls, the agent's own lint runs and the hook's;
- lines added and removed, ignoring whitespace and not. Ignoring it is the measure the claim uses; re-indenting a block, which a guard clause does, would otherwise count every line in it;
- functions added;
- the highest score left;
- the subscription's reported usage, when there is one.

## Analysis

The unit is the task. A task's runs under each arm are averaged first. Intervals are bootstraps: tasks are resampled, then runs within each task, 10,000 times, with a fixed seed, over runs in a fixed order. `analyze.mjs` computes everything below and prints the report.

**Primary claim (B against A, Sonnet).** The hint helps if both hold:

- success isn't worse: the lower bound of B − A's success rate, at 95%, is at least −0.10;
- B is cheaper or changes less: the upper bound of B − A on cost per run, or on lines changed, is below 0. The claim has two chances here, so each interval is at 97.5%.

Cost and lines changed are averaged over all runs. A run that gives up early costs little and changes little, so a hint that made agents give up would look good on both; the success margin is what rules that out. Figures over successful runs only are reported too, leaving out a task where either arm has no successful run, but don't count towards the claim. The results are also broken out by the kind of first hint (guard or move), as a description.

**Strategy (C against B, split tasks).** The simulation already chose guard if enough: where the strategies differ, it reaches the max in 89 lint rounds against guard first's 144. Eight tasks can't show it winning with agents, so this comparison checks only that it does no harm. Guard if enough ships unless it is clearly worse than guard first, at 95%, on any of:

- success: the upper bound of C − B is below 0;
- cost per run, or lines changed: the lower bound of C − B is above 0.

Otherwise guard first stays. The results say how little power the check has.

**Reporting.** Every measure, every failed run with its reason, the re-runs, the cap hits, the cells left with no run and the incomplete blocks are reported. A null or negative result is reported as it is.

## Running it

**Stages:**

1. **Build.** Done.
2. **Check runs.** 18 runs on the subscription confirmed the hooks, the sandbox and the records, and found bugs in the harness that are fixed. A probe block on the API, A and B on all 44 tasks with Sonnet, set the caps. None of these runs count.
3. **Freeze.** Commit the protocol, the tasks, the caps and the hashes. `tasks.json` records:
   - the hashes of the plugins, the harness, the hook, and both lockfiles;
   - the versions of ESLint, Prettier, Oxlint, the SDK and Node.

   The runner checks them before every run, and each run's copy of its plugin after it; a difference stops the benchmark.

4. **Counted runs.**

**Settings.** Every counted run uses effort `high`, and caps of 25 turns and $0.50; `counted.mjs` fixes them, and each block records them. In the probe the most any run took was 7 turns and $0.11, so a cap stops only a run that has gone wrong.

**Blocks.** Counted runs go in blocks, each one run of every cell, shuffled within the block with a fixed seed. Sonnet's blocks hold A and B on every task and C on the split tasks, 96 runs, so C runs under the same conditions as the B it's compared with. Haiku's blocks hold A and B. The runs planned:

| Model      | Blocks | Runs | About |
| ---------- | -----: | ---: | ----: |
| Sonnet 5.5 |      5 |  480 |   $22 |
| Haiku 5.5  |      3 |  264 |    $2 |

Before each block, the runner continues only if the block's cost fits what is left, at the observed mean cost per run plus 25%; before the first, the mean comes from earlier API runs of the same model: the probe for Sonnet, and the run that checked the key for Haiku. Running out of budget therefore always stops at the end of a block. A block is written as incomplete when it starts, and marked complete only when every cell has run. A block that stops part-way isn't counted. It stops for:

- an account error, such as running out of credit;
- the key appearing in a run's records, which then aren't kept;
- an error in the harness itself.

A cell whose run and re-run both fail on the service's side has no run in that block; the block lists it, and the report shows it.

Every block under a label must have the same model, arms, tasks, settings and hashes; the runner refuses one that differs, and the analysis checks it. `--blocks` is the number of complete blocks the label should end with, so the same command picks up after a stop.

The commands, with the key file and budget as set up for the account:

```sh
node scripts/agent-benchmark/benchmark.mjs counted --label sonnet --model claude-sonnet-5-5 --arms A,B,C --blocks 5 --funding api --key-file <key file> --budget <usd> --estimate-from probe
node scripts/agent-benchmark/benchmark.mjs counted --label haiku --model claude-haiku-5-5 --arms A,B --blocks 3 --funding api --key-file <key file> --budget <usd> --estimate-from keycheck
node scripts/agent-benchmark/analyze.mjs --label sonnet
```

## What the probe showed

These are the uncounted probe's numbers, recorded here because they shaped the plan, not as results.

- **Success is at the ceiling.** Every one of the 88 runs succeeded, under both arms. The counted runs are unlikely to separate the arms on success, so the claim rests on cost and lines changed, as the analysis already allows.
- **Agents mostly edit through Bash.** Sonnet often rewrote the file with one script and ran `npx oxlint` and the tests itself, so the hook, which runs after Edit and Write, fired in only some runs. The hint reaches the agent through the prompt and through the lint runs it starts. The snapshots record every step either way.
- **Scripts in `/tmp`, and commands that fail.** About a quarter of the runs wrote a script to `/tmp` under a fixed name, such as `/tmp/refactor.py`, and many ended a command with a lint run that exits non-zero. Both shaped the harness: the sandbox allows `/tmp` explicitly and each run's leftovers there move into its records, and failed tool calls are snapshotted too.
- **The probe ran three sessions at a time.** Counted runs go one at a time instead, so no run can read another's files or slow it down.

## Limits

- **ESLint is likely in the models' training data.** That applies equally to every arm.
- **The behavior check isn't proof.** It covers the test file's option sets on the test cases, ESLint's own code and Prettier's. Some rules find bugs that real code rarely has, such as `valid-typeof`'s misspelled type names, and report on almost nothing outside their tests: 11 of the 44 rules report on at most one corpus check. For those, the check adds little to the tests. Each run records how many checks reported anything, on the test cases and on the corpus apart.
- **The scoring runs the agent's code outside the sandbox.** The tests and the behavior check load the edited rule with only `PATH` in its environment, but with the network and the user's files within reach. The agent is asked to refactor a lint rule, and its code is read in the records.
- **The machine is shared with whatever else runs on it.** Duration is recorded but isn't a measure.
- **Oxlint's default rules also run in the hook.** They report things such as unused variables in half-finished edits. They are the same for every arm.

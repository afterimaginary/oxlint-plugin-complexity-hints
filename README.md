# oxlint-plugin-complexity-hints

Keep code written by coding agents easy for people to review. An [Oxlint](https://oxc.rs/docs/guide/usage/linter) rule scores each function's cognitive complexity, and when one goes over the max, its one-line message names a change to make, almost always with the score the function reaches; a checker, [`complexity-hints`](#for-agents), holds the agent only to what its own change is responsible for.

> **Status:** early development. Nothing is published yet, and the API may change.

## Example

```js
export function shippingCost(order, rates) {
	let total = 0;

	for (const item of order.items) {
		if (item.shippable) {
			if (item.weight > rates.heavyLimit && !order.freeShipping) {
				total += rates.heavy;
			} else if (item.fragile) {
				total += rates.fragile;
			} else {
				total += rates.standard;
			}

			for (const extra of item.extras) {
				if (extra.insured && extra.value > rates.insuranceFloor) {
					total += extra.value * rates.insurance;
				}
			}
		}
	}

	if (order.express) {
		total *= order.international ? rates.expressInternational : rates.express;
	}

	return total;
}
```

`oxlint --format agent` with the `recommended` preset:

```text
src/shipping.js:1:17: error complexity(cognitive-complexity): Function 'shippingCost' at lines 1-27 has cognitive complexity 20, over the max of 15; main contributors: 'if' at line 15 (+4, nested 3 deep), 'if' at line 6 (+3, nested 2 deep), 'for...of' at line 14 (+3, nested 2 deep); fix: move lines 6-18 (the body of the 'if' at line 5) into a new function; it reassigns 'total', which the code around it reads, so have it return the new 'total' and assign it from the call; this one drops to 6 and the new one scores 8.
```

Once the agent makes the change, the next run scores the function again and suggests the next one.

## Quick start

**With a coding agent:** [`install.md`](install.md) walks Claude Code through installing and configuring the plugin, the checker and the hook in your project, asking you where a choice is yours. Pipe it in from your project's directory, or point your agent at the file:

```bash
curl -fsSL https://raw.githubusercontent.com/afterimaginary/oxlint-plugin-complexity-hints/main/install.md | claude
```

**By hand:** it requires Oxlint 1.83.0 or later, and Node.js `^20.19.0 || >=22.12.0`.

```bash
npm install --save-dev oxlint oxlint-plugin-complexity-hints
```

With [Vite+](https://viteplus.dev), which bundles Oxlint (`vp toolchain oxlint` shows its version):

```bash
vp add -D oxlint-plugin-complexity-hints
```

Then turn on the `recommended` preset, in `.oxlintrc.json` or [another config file](#configure), and add the [agent hook](#for-agents).

## Evidence

- **The hints keep their promise.** On ESLint, Prettier, Vite and Excalidraw, each of the 318 fixes that states a score was applied mechanically, and every one reached exactly that score ([hint evaluation](docs/evaluation/hints.md)).
- **Following them reaches the max.** Applying the hints one at a time brings 301 of the 319 over-max functions in those codebases to the max; for the rest, the hint ends at a general direction ([simulation](docs/evaluation/strategies.md)).
- **In a pilot, agents made smaller changes with them.** Fixing 44 over-max ESLint functions, Claude Sonnet 5.5 always succeeded, and its changes were about a tenth smaller with this rule's message than with a bare score: a direction from one run per function, not an effect size ([agent pilot](docs/evaluation/agent-pilot.md)).

## Why

Every function an agent changes still has to be reviewed by people, and the more complex a function, the longer people tend to take to understand it ([Muñoz Barón et al., 2020](https://arxiv.org/abs/2007.12520)). Cognitive complexity measures how hard a function is to read: each `if`, loop or `catch` adds a point, plus one more for each level it is nested. Scores follow SonarSource's [Cognitive Complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) and match `eslint-plugin-sonarjs`, so they are the numbers SonarQube users already know. It's a proxy, with the [limits](#limits) that implies.

Oxlint gives a plugin's diagnostic one line: no help text, no docs URL. A bare "complexity 20 > 15" leaves an agent guessing which part to change, so this rule's message names the main contributors and one concrete change, with the score the function reaches once it's made.

## Configure

The `recommended` preset turns on `complexity/cognitive-complexity` at its default max of 15, and Oxlint's `max-params` at 5. Use whichever config file the project already has.

`.oxlintrc.json`:

```json
{
	"extends": ["./node_modules/oxlint-plugin-complexity-hints/recommended.json"]
}
```

`oxlint.config.ts`:

```ts
import { defineConfig } from "oxlint";
import recommended from "oxlint-plugin-complexity-hints/recommended";

export default defineConfig({
	extends: [recommended],
});
```

`vite.config.ts`, for `vp lint`:

```ts
import { defineConfig } from "vite-plus";
import recommended from "oxlint-plugin-complexity-hints/recommended";

export default defineConfig({
	lint: {
		extends: [recommended],
	},
});
```

To use the rule without the preset, load the plugin and turn the rule on:

```json
{
	"jsPlugins": ["oxlint-plugin-complexity-hints"],
	"rules": {
		"complexity/cognitive-complexity": "error"
	}
}
```

The plugin registers itself as `complexity`. If a project already loads another JS plugin under that name, load this one under an alias, and use the alias as the rule's prefix. The preset loads the plugin under its own name, so use this form instead of the preset, and turn on `max-params` yourself if you want it:

```json
{
	"jsPlugins": [{ "name": "complexity-hints", "specifier": "oxlint-plugin-complexity-hints" }],
	"rules": {
		"complexity-hints/cognitive-complexity": "error"
	}
}
```

## Options

| Option | Type               | Default | Meaning                                              |
| ------ | ------------------ | ------- | ---------------------------------------------------- |
| `max`  | integer, 0 or more | `15`    | A function is reported when its score is over `max`. |

To change it, set the rule after `extends`:

```json
{
	"extends": ["./node_modules/oxlint-plugin-complexity-hints/recommended.json"],
	"rules": {
		"complexity/cognitive-complexity": ["error", { "max": 20 }]
	}
}
```

What counts toward the score, how it differs from the whitepaper, why there is no cyclomatic rule, and what the preset leaves out: see the [rule docs](docs/rules/cognitive-complexity.md).

## For agents

**Claude Code only, for now.** The hook, the guidance below and the agent pilot that informed them are written for and tested with Claude Code. The checker is a plain command that any agent or hook can run, but other agents' setups aren't documented or tested yet.

**Check each change as the agent makes it.** The package's `complexity-hints` command runs the project's Oxlint on what changed since the branch left the default branch, and reports only what the change is responsible for: a function the change touches, when the change also touches the code the diagnostic's fix points at. Functions the change didn't touch aren't reported, so the agent isn't pulled into refactoring code outside its task. In Claude Code, a `PostToolUse` hook in `.claude/settings.json` runs it after each edit:

```json
{
	"hooks": {
		"PostToolUse": [
			{
				"matcher": "Edit|Write|Bash",
				"hooks": [
					{
						"type": "command",
						"command": "\"$CLAUDE_PROJECT_DIR\"/node_modules/.bin/complexity-hints --claude-code-hook"
					}
				]
			}
		]
	}
}
```

With `--claude-code-hook`, the checker:

- checks the file an `Edit` or `Write` call changed, or the files a `Bash` command changed, when they're in the project; any other call passes;
- exits 2 when something blocks, which passes the diagnostics back to the agent;
- fails with another exit code when the check can't run, for example with no default branch to compare against or the package not installed: the user sees the error, and the agent isn't blocked;
- runs `vp lint` in a Vite+ project, and `oxlint` otherwise.

Claude Code lists the files a `Bash` command changed from version 2.1.269, and without any setting only in auto and `bypassPermissions` modes. For every mode, set `"bashEditDiffEnabled": true` in your user settings (`~/.claude/settings.json`), since a `true` in a project's settings doesn't count, or `CLAUDE_CODE_BASH_EDIT_DIFF=1` for a session. [The spec](docs/specs/scoped-checker.md) has the checker's options and output.

**Gate the commit too.** Run `npx --no complexity-hints` before each commit or in CI: it exits 1 when something blocks, and `--no` keeps `npx` from fetching a package of that name when the project's own isn't installed. In a `pull_request` workflow, CI needs the history back to the merge base, the project's dependencies, and the base named:

```yaml
- uses: actions/checkout@v7
  with:
    fetch-depth: 0
- uses: actions/setup-node@v7
- run: npm ci
- run: npx --no complexity-hints --base origin/${{ github.base_ref }}
```

**Tell the agent how to respond.** For example, in `CLAUDE.md` or `AGENTS.md`:

- Keep refactoring within the change. Leave over-max functions outside it alone unless the task covers them.
- When the change pushes a function over the max, or touches one already over it, first restructure that function in a behavior-preserving commit of its own, then make the change, so each can be reviewed on its own.
- Don't raise `max` or add `oxlint-disable` comments. Each diagnostic names a change to make instead: almost always a concrete one, with the score it reaches, and otherwise a general direction, such as splitting the code around a line into smaller functions.

By default, a function the change touches isn't blocked when its fix points at lines the change didn't touch: run by hand, the checker lists it as a note. `--strict` blocks it too.

**Parallel agents need their own worktrees.** The change is everything in the working tree since the base, whoever made it, so agents editing one checkout at once are each held to the others' edits.

## Limits

- **Cognitive complexity is a proxy.** Across about 24,000 understandability evaluations of 427 snippets, it correlates with how long people take to understand code and how understandable they rate it, with mixed results for whether they understand it correctly ([Muñoz Barón et al., 2020](https://arxiv.org/abs/2007.12520)). It predicts understandability about as well as older measures such as lines of code and cyclomatic complexity, not better ([Lavazza et al., 2023](https://doi.org/10.1016/j.jss.2022.111561)). A function under the max isn't necessarily easy to read, and one over it isn't always worth changing.
- **Moving code has a cost.** Moving a region into a new function leaves both functions scoring less than the original, but the reader now follows the logic across two of them. A guard clause has no such reading cost, so the rule suggests one whenever it alone brings the function to the max.
- **The score is checked, not the behavior.** The hint evaluation checks that each fix reaches the scores it states and still parses. Whether the change preserves behavior is up to the agent and the project's tests.
- **The agent setup targets Claude Code.** The hook and the instructions in [For agents](#for-agents) are tested only with Claude Code.
- **Oxlint's JS plugin API is in alpha.** Oxlint's [JS plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins.html) are under active development and not subject to semver, so an Oxlint upgrade can break the plugin before a fix ships here.

## Development

Requires [Vite+](https://viteplus.dev) (`vp`).

```bash
vp install
vp run ready
```

`vp run ready` formats, lints, type-checks and runs the tests. `vp run verify` adds the build and checks on the built package, and runs on every pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to propose changes, the [specs](docs/specs/) for exactly how scores and messages are produced, and [`docs/decisions/`](docs/decisions/) for the reasoning behind the project's scope.

## License

[MIT](LICENSE)

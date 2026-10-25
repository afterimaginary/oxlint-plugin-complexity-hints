# oxlint-plugin-complexity-hints

A cognitive complexity rule for [Oxlint](https://oxc.rs/docs/guide/usage/linter), with single-line diagnostics written for AI coding agents running a lint loop.

> **Status:** early development. Nothing is published yet, and the API may change.

## Why

Cognitive complexity measures how hard a function is to read: each `if`, loop or `catch` adds a point, plus one more for each level it is nested. Scores follow SonarSource's [Cognitive Complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) and match `eslint-plugin-sonarjs`, so they are the numbers SonarQube users already know.

Oxlint gives a plugin's diagnostic one line: no help text, no docs URL. A bare "complexity 20 > 15" leaves an agent guessing which part to change, so this rule's message names the main contributors and one concrete change, with the score the function reaches once it's made.

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
src/shipping.js:1:17: error complexity(cognitive-complexity): Function 'shippingCost' has cognitive complexity 20, over the max of 15; main contributors: 'if' at line 15 (+4, nested 3 deep), 'if' at line 6 (+3, nested 2 deep), 'for...of' at line 14 (+3, nested 2 deep); fix: invert the 'if' at line 5 into a guard clause that continues to the next iteration early, so its body moves up a level; this one drops to 17.
```

On the open-source codebases in the [hint evaluation](docs/evaluation/hints.md), every guard-clause fix reached exactly the score it stated. Fixes that move code into a new function aren't checked that way yet. Once the agent makes the change, the next run scores the function again and suggests the next one.

## Install

Requires Oxlint 1.83.0 or later, and Node.js `^20.19.0 || >=22.12.0`.

```bash
npm install --save-dev oxlint oxlint-plugin-complexity-hints
```

With [Vite+](https://viteplus.dev), which bundles Oxlint (`vp toolchain oxlint` shows its version):

```bash
vp add -D oxlint-plugin-complexity-hints
```

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

**Keep the threshold in config.** Set `max` once in the config file, and tell the agent not to raise it or add `oxlint-disable` comments. Each diagnostic names a change to make instead. Almost always it's a concrete change, with the score it reaches. In the rare case that no guard clause or region to move qualifies, it gives a general direction, such as splitting the code around a line into smaller functions.

**Lint each file as the agent edits it.** Oxlint's `agent` format prints one line per diagnostic. Oxlint already picks it when it detects an agent, but naming it keeps the hook independent of that. In Claude Code, a `PostToolUse` hook in `.claude/settings.json` that exits 2 passes its output back to the agent:

```json
{
	"hooks": {
		"PostToolUse": [
			{
				"matcher": "Edit|Write",
				"hooks": [
					{
						"type": "command",
						"command": "f=$(jq -r .tool_input.file_path); npx oxlint --format agent --no-error-on-unmatched-pattern \"$f\" >&2 || exit 2"
					}
				]
			}
		]
	}
}
```

It needs [`jq`](https://jqlang.org). Files Oxlint doesn't lint, such as Markdown, pass through. In a Vite+ project, run `vp lint` in place of `npx oxlint`, with the same flags: the `oxlint` binary Vite+ installs is for editors only, and `vp lint` is what reads the `lint` block of `vite.config.ts`. Other agents with an after-edit hook can run the same command.

For now, the hook lints the whole edited file, so it also reports over-max functions the edit didn't touch; a checker scoped to the change is planned. Tell the agent to leave those alone unless its task covers them: restructuring code outside the change makes the change harder to review.

## Limits

- **Cognitive complexity is a proxy.** Across about 24,000 ratings of 427 snippets, it correlates with how long people take to understand code and how understandable they rate it, with mixed results for whether they understand it correctly ([Muñoz Barón et al., 2020](https://arxiv.org/abs/2007.12520)). It predicts understandability about as well as older measures such as lines of code and cyclomatic complexity, not better ([Lavazza et al., 2023](https://doi.org/10.1016/j.jss.2022.111561)). A function under the max isn't necessarily easy to read, and one over it isn't always worth changing.
- **Moving code has a cost.** Moving a region into a new function leaves both functions scoring less than the original, but the reader now follows the logic across two of them. A guard clause has no such reading cost, which is one reason the rule suggests one first.
- **The score is checked, not the behavior.** The hint evaluation checks that each guard-clause fix reaches the score it states and still parses. Whether the change preserves behavior is up to the agent and the project's tests.
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

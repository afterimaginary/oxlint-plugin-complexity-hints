# complexity-plugin-oxlint

A cognitive complexity rule for [Oxlint](https://oxc.rs/docs/guide/usage/linter), with single-line diagnostics written for AI coding agents running a lint loop.

> **Status:** early development. Nothing is published yet, and the API may change.

## Why

Cognitive complexity measures how hard a function is to read: each `if`, loop or `catch` adds a point, plus one more for each level it is nested. Scores follow SonarSource's [Cognitive Complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) and match `eslint-plugin-sonarjs`, so they are the numbers SonarQube users already know.

Oxlint gives a plugin's diagnostic one line: no help text, no docs URL. A bare "complexity 20 > 15" leaves an agent guessing which part to change, so this rule's message names the main contributors and one concrete change that lowers the score.

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

Each suggested change lowers the score. Once the agent makes it, the next run scores the function again and suggests the next.

## Install

Requires Oxlint 1.83.0 or later, and Node.js `^20.19.0 || >=22.12.0`.

```bash
npm install --save-dev oxlint complexity-plugin-oxlint
```

With [Vite+](https://viteplus.dev), which bundles Oxlint:

```bash
vp add -D complexity-plugin-oxlint
```

## Configure

The `recommended` preset turns on `complexity/cognitive-complexity` at its default max of 15, and Oxlint's `max-params` at 5. Use whichever config file the project already has.

`.oxlintrc.json`:

```json
{
	"extends": ["./node_modules/complexity-plugin-oxlint/recommended.json"]
}
```

`oxlint.config.ts`:

```ts
import { defineConfig } from "oxlint";
import recommended from "complexity-plugin-oxlint/recommended";

export default defineConfig({
	extends: [recommended],
});
```

`vite.config.ts`, for `vp lint`:

```ts
import { defineConfig } from "vite-plus";
import recommended from "complexity-plugin-oxlint/recommended";

export default defineConfig({
	lint: {
		extends: [recommended],
	},
});
```

To use the rule without the preset, load the plugin and turn the rule on:

```json
{
	"jsPlugins": ["complexity-plugin-oxlint"],
	"rules": {
		"complexity/cognitive-complexity": "error"
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
	"extends": ["./node_modules/complexity-plugin-oxlint/recommended.json"],
	"rules": {
		"complexity/cognitive-complexity": ["error", { "max": 20 }]
	}
}
```

What counts toward the score, how it differs from the whitepaper, why there is no cyclomatic rule, and what the preset leaves out: see the [rule docs](docs/rules/cognitive-complexity.md).

## For agents

**Keep the threshold in config.** Set `max` once in the config file, and tell the agent not to raise it or add `oxlint-disable` comments. Every diagnostic carries a change that lowers the score, so there is always a way under the max that doesn't move it.

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

It needs [`jq`](https://jqlang.org). Files Oxlint doesn't lint, such as Markdown, pass through. Other agents with an after-edit hook can run the same `oxlint` command.

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

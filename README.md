# complexity-plugin-oxlint

A cognitive complexity rule for [Oxlint](https://oxc.rs/docs/guide/usage/linter), with single-line diagnostics written for AI coding agents running a lint loop.

> **Status:** early development. Nothing is published yet, and the API may change.

## Why

Oxlint's JS plugin API gives a rule one line of output: no `help` text, no docs URL. A bare "complexity 22 > 15" leaves an agent guessing. This plugin's diagnostics say which function is too complex, where the complexity comes from, and one concrete change that lowers it:

```
src/orders.ts:3:17: error complexity(cognitive-complexity): Function 'processOrder' has cognitive complexity 23, over the max of 15; main contributors: 'if' at line 16 (+4, nested 3 deep), 'if' at line 26 (+4, nested 3 deep), 3 '&&' at lines 8-26 (+3); fix: invert the 'if' at line 12 into a guard clause that continues to the next iteration early, so its body moves up a level; this one drops to 19.
```

The format is specified in [`docs/specs/diagnostics.md`](docs/specs/diagnostics.md).

Scores follow SonarSource's [Cognitive Complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) specification, so they match what SonarQube users already know.

## Requirements

- [Oxlint](https://oxc.rs/docs/guide/usage/linter) 1.83.0 or later, which the package declares as a peer dependency.
- Node.js `^20.19.0 || >=22.12.0`, the same as Oxlint.

## Development

Requires [Vite+](https://viteplus.dev) (`vp`).

```bash
vp install
vp run ready
```

`vp run ready` formats, lints, type-checks and runs the tests. `vp run verify` adds the build and checks on the built package, and runs on every pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to propose changes, and [`docs/decisions/`](docs/decisions/) for the reasoning behind the project's scope.

## License

[MIT](LICENSE)

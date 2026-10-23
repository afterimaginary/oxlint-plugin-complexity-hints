# complexity-plugin-oxlint

A cognitive complexity rule for [Oxlint](https://oxc.rs/docs/guide/usage/linter), with single-line diagnostics written for AI coding agents running a lint loop.

> **Status:** early development. Nothing is published yet, and the API may change.

## Why

Oxlint's JS plugin API gives a rule one line of output: no `help` text, no docs URL. A bare "complexity 22 > 15" leaves an agent guessing. This plugin's diagnostics say which function is too complex, where the complexity comes from, and one concrete change that would bring it under the limit.

Scores follow SonarSource's [Cognitive Complexity](https://www.sonarsource.com/docs/CognitiveComplexity.pdf) specification, so they match what SonarQube users already know.

## Development

Requires [Vite+](https://viteplus.dev) (`vp`).

```bash
vp install
vp run ready
```

`vp run ready` formats, lints, type-checks and runs the tests. `vp run verify` adds the build and runs on every pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to propose changes, and [`docs/decisions/`](docs/decisions/) for the reasoning behind the project's scope.

## License

[MIT](LICENSE)

# Contributing

Thanks for your interest in improving oxlint-plugin-complexity-hints.

## Before you start

- **Bugs:** open an issue with the code that was scored, the score you expected, and the score or diagnostic you got.
- **Features and larger changes:** open an issue first so the approach can be agreed before you write code.

## Development setup

Requires [Vite+](https://viteplus.dev) (`vp`), which manages Node.js and pnpm for you.

```bash
vp install
```

Installing also sets up the git hooks: the pre-commit hook formats and lints staged files, and the pre-push hook runs `vp run ready`.

| Command                 | Does                                                                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp run ready`          | Format check, lint, type check and tests. Run it before opening a pull request.                                                              |
| `vp run verify`         | `ready`, the build, and checks on the built package. CI runs it on every pull request.                                                       |
| `vp run evaluate-hints` | Runs the rule over pinned open-source repositories and rewrites `docs/evaluation/hints.md`. Needs the network; refresh it when hints change. |
| `vp run simulate-hints` | Plays the lint loop on the same repositories under each hint strategy and rewrites `docs/evaluation/strategies.md`. Needs the network.       |
| `vp test`               | Tests only.                                                                                                                                  |
| `vp check --fix`        | Format and apply safe lint fixes.                                                                                                            |

## Fuzzing against sonarjs

`tests/fuzz.test.ts` compares this rule with `eslint-plugin-sonarjs` on random programs. It runs a fixed set in `verify`; to search further, change the seed and the count:

```bash
FUZZ_SEED=7 FUZZ_RUNS=20000 vp test tests/fuzz.test.ts
```

A failure prints the seed, a `path` and the shrunk program. Add that program to a fixture in `tests/fixtures/`, so the oracle test keeps it, then fix the rule. If sonarjs is the one that's wrong, pin the whitepaper total instead and add the case to the deviations in `docs/specs/scoring.md`. If the program doesn't parse, the generator is at fault: fix `tests/programs.ts`.

## Pull requests

- Keep each pull request to one change, and link the issue it resolves.
- Add or update tests for any change in scoring or diagnostics.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for the pull request title, e.g. `fix(rule): count nested ternaries once`.
- Fill in the pull request template, including what you ran to verify the change.

## Releasing

A maintainer publishes a GitHub release from `main`, and the tag is the version:

```bash
gh release create v0.1.0 --target main --generate-notes
```

The tag has to be a plain `vX.Y.Z` on a commit in `main`; anything else fails before publishing. The `release` workflow sets the version from the tag, runs `verify` and publishes to npm with provenance, through npm's trusted publishing, so no token is stored. `package.json` stays at `0.0.0` in the repository. The release notes GitHub generates from the merged pull requests are the changelog.

npm only lets a package that already exists trust a workflow, so the first time, a maintainer publishes the `0.0.0` placeholder by hand with `vp pm publish`, adds `release.yml` as the package's trusted publisher on npmjs.com, and creates the first release within two days, which npm requires of a new trusted publisher.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

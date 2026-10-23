# Contributing

Thanks for your interest in improving complexity-plugin-oxlint.

## Before you start

- **Bugs:** open an issue with the code that was scored, the score you expected, and the score or diagnostic you got.
- **Features and larger changes:** open an issue first so the approach can be agreed before you write code.

## Development setup

Requires [Vite+](https://viteplus.dev) (`vp`), which manages Node.js and pnpm for you.

```bash
vp install
```

Installing also sets up the git hooks: the pre-commit hook formats and lints staged files, and the pre-push hook runs `vp run ready`.

| Command          | Does                                                                            |
| ---------------- | ------------------------------------------------------------------------------- |
| `vp run ready`   | Format check, lint, type check and tests. Run it before opening a pull request. |
| `vp run verify`  | `ready` plus the build. CI runs it on every pull request.                       |
| `vp test`        | Tests only.                                                                     |
| `vp check --fix` | Format and apply safe lint fixes.                                               |

## Pull requests

- Keep each pull request to one change, and link the issue it resolves.
- Add or update tests for any change in scoring or diagnostics.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for the pull request title, e.g. `fix(rule): count nested ternaries once`.
- Fill in the pull request template, including what you ran to verify the change.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).

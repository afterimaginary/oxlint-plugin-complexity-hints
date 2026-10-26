# oxlint-plugin-complexity-hints

> An Oxlint rule that scores each function's cognitive complexity and gives a one-line hint for fixing one over the max, with a checker, `complexity-hints`, that reports only what a change is responsible for, run after each edit by a Claude Code hook.

I want you to set up oxlint-plugin-complexity-hints in this project for me. Execute the steps below, and stop to ask me wherever a step says to. These steps are written for Claude Code, the only agent the setup is tested with.

OBJECTIVE: Install the plugin, turn on its rule, add the Claude Code hook that runs the checker after each edit, and add guidance to the project's agent instructions, changing nothing else.

DONE WHEN: The project's linter runs with `complexity/cognitive-complexity` on, `npx --no complexity-hints` exits 0 or 1, and the hook's command, run once with a sample input, exits 0 or 2.

## TODO

- [ ] Check the project's Node.js, git, Oxlint, package manager and lint config
- [ ] Install the package
- [ ] Turn on the rule with the `recommended` preset
- [ ] Add the Claude Code hook, where I choose
- [ ] Add the guidance to the agent instructions
- [ ] Ask me about a commit or CI gate
- [ ] Check that the rule, the checker and the hook work
- [ ] Report what you did

You must change only what these steps name. Don't fix existing over-max functions, raise the max, or add `oxlint-disable` comments: the point of the setup is that later changes stay within their own scope. The package isn't on npm yet: until its first release, the install step can't find it, so stop there and tell me.

## Check the project

You need to find out, without changing anything:

- **Node.js** is `^20.19.0 || >=22.12.0` (`node --version`).
- **Git:** the project is a git repository with a default branch: `origin/HEAD`, `main` or `master`. The checker compares the change against it.
- **Vite+ or plain Oxlint:** the project uses [Vite+](https://viteplus.dev) when `package.json` lists `vite-plus`, and `vp toolchain oxlint` shows the Oxlint it bundles. Otherwise, note whether `oxlint` is installed, and its version. Either way, Oxlint must be 1.83.0 or later.
- **Package manager:** from the lockfile: `package-lock.json` (npm), `pnpm-lock.yaml` (pnpm), `yarn.lock` (Yarn), or `bun.lock` or `bun.lockb` (Bun).
- **Lint config:** which of `.oxlintrc.json`, `oxlint.config.ts`, or the `lint` block of `vite.config.ts` the project already has.

If Node.js is too old, or the project isn't a git repository, stop and tell me.

## Install the package

With Vite+:

```bash
vp add -D oxlint-plugin-complexity-hints
```

Otherwise, with the project's package manager:

```bash
npm install --save-dev oxlint-plugin-complexity-hints
```

Add `oxlint` to the same command if it isn't installed or is older than 1.83.0. With pnpm, Yarn or Bun, use `pnpm add -D`, `yarn add -D` or `bun add -d`. With Vite+, if the bundled Oxlint is older than 1.83.0, stop and tell me to update Vite+.

## Turn on the rule

You need to add the `recommended` preset to the config file the project already has, keeping everything else in it. The preset turns on `complexity/cognitive-complexity` at a max of 15, and Oxlint's `max-params` at 5. The README's [Configure](https://github.com/afterimaginary/oxlint-plugin-complexity-hints#configure) section shows each file:

- `.oxlintrc.json`: add `"./node_modules/oxlint-plugin-complexity-hints/recommended.json"` to `extends`.
- `oxlint.config.ts`, or the `lint` block of `vite.config.ts`: import `recommended` from `oxlint-plugin-complexity-hints/recommended` and add it to `extends`.

If the project has no lint config, create `.oxlintrc.json` with only that `extends`. If the config already loads another JS plugin named `complexity`, load this one under an alias instead, as the Configure section shows. The preset loads the plugin under its own name, so the alias form replaces the preset: turn on `max-params` too, at 5, unless the project already sets it.

## Add the Claude Code hook

Ask me where the hook should go:

- **`.claude/settings.json`:** shared with everyone working on the project, and committed.
- **`.claude/settings.local.json`:** just for me, and not committed.

Merge this into that file, creating it if it doesn't exist, and keeping any hooks already there:

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

After each `Edit`, `Write` or `Bash` call, the hook checks the project files the call changed. When the change is responsible for an over-max function, it shows the diagnostics to the agent.

Then tell me about edits made through Bash. Claude Code reports which files a Bash command changed only from version 2.1.269 (`claude --version`), and in every permission mode only with this in my user settings, `~/.claude/settings.json`:

```json
{
	"bashEditDiffEnabled": true
}
```

A project's settings can't turn it on. Don't edit my user settings unless I ask you to.

## Add the guidance

You need to add these to the project's agent instructions: `CLAUDE.md`, or `AGENTS.md` if the project uses that. Create `CLAUDE.md` if neither exists.

- Keep refactoring within the change. Leave over-max functions outside it alone unless the task covers them.
- When the change pushes a function over the max, or touches one already over it, first restructure that function in a behavior-preserving commit of its own, then make the change, so each can be reviewed on its own.
- Don't raise `max` or add `oxlint-disable` comments. Each diagnostic names a change to make instead: almost always a concrete one, with the score it reaches, and otherwise a general direction, such as splitting the code around a line into smaller functions.

## Ask about a commit or CI gate

Ask me whether to also run the checker before commits or in CI. If I want it, follow "Gate the commit too" in the README's [For agents](https://github.com/afterimaginary/oxlint-plugin-complexity-hints#for-agents) section. Use the project's existing pre-commit tool or CI workflow, and don't add a new one without asking.

## Check it works

1. **The rule loads.** Run the project's linter on its source: `vp lint` with Vite+, or else `npx oxlint`. It should run without a config error. Any function over the max shows up as `complexity(cognitive-complexity)`. Leave those functions alone.
2. **The checker runs.** Run `npx --no complexity-hints`.
   - Exit 0 or 1: it works. Exit 1 means the change since the default branch is responsible for an over-max function.
   - Exit 2: it couldn't run, and its message says why. With no default branch, ask me which branch changes are compared against, and add `--base <ref>` to the end of the hook's command and to the gate's.
3. **The hook runs.** The settings file is valid JSON and holds the hook. Run the hook's command once, from the project's directory, with a sample input naming one of the project's source files:

   ```bash
   echo '{"tool_input":{"file_path":"'"$PWD"'/src/index.ts"}}' | CLAUDE_PROJECT_DIR="$PWD" node_modules/.bin/complexity-hints --claude-code-hook
   ```

   Exit 0 or 2 means it works. Any other exit code means it can't run: its message says why.

## Report

Tell me:

- what you installed;
- which files you changed;
- where the hook went, and whether I need `bashEditDiffEnabled` and a newer Claude Code;
- how many functions are over the max today, without fixing them.

The hook takes effect in Claude Code sessions started after the settings change.

EXECUTE NOW: Complete the above TODO list to achieve: the project's linter runs with `complexity/cognitive-complexity` on, `npx --no complexity-hints` exits 0 or 1, and the hook's command, run with a sample input, exits 0 or 2.

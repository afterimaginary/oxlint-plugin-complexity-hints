// One run of the agent benchmark: a Claude Agent SDK session in a fresh tree, asked to fix
// the task's lint error, with the README's lint hook. Every message and a snapshot after
// every tool call are kept, then the final tree is scored. See
// docs/designs/agent-benchmark.md.
import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { root, run } from "../eval-repos.mjs";
import { baseDir, benchDir, bundleDir } from "./prepare.mjs";
import { score, snapshotGit } from "./score.mjs";
import { createWorkspace } from "./workspace.mjs";

const SDK_VERSION = JSON.parse(
	readFileSync(join(root, "node_modules/@anthropic-ai/claude-agent-sdk/package.json"), "utf8"),
).version;

/** The tools the agent has; nothing for the web, subagents or MCP. */
export const TOOLS = ["Bash", "Edit", "Glob", "Grep", "Read", "Write"];

const lintCommand = (task) => `npx oxlint --format agent ${task.file}`;
const testCommand = (task) => `npx mocha tests/lib/rules/${task.rule}.js`;

/** The prompt, the same for every arm but for the diagnostics it quotes. */
export function prompt(task, diagnostics) {
	return `\`${lintCommand(task)}\` reports this:

${diagnostics.trim()}

Fix it without changing what the rule does. Keep the max where it is, and don't add \`oxlint-disable\` or \`eslint-disable\` comments. The rule's tests are in \`tests/lib/rules/${task.rule}.js\`; run them with \`${testCommand(task)}\`.
`;
}

/** Errors that come from the service, not the model: the run is re-run once, or the benchmark stops. */
const INFRASTRUCTURE =
	/rate.?limit|overloaded|529|429|500 |internal server error|timed? ?out|ECONNRESET|socket hang up/i;

const STOP = /credit balance is too low|usage limit|spend limit|out of (?:extra )?usage/i;

/**
 * The run's environment, built from nothing so the launching shell's settings (a Claude
 * Code session's among them) don't reach the agent. An API key is passed only when
 * `funding` is "api".
 */
function environment(funding, apiKey, npmCache) {
	const env = {
		PATH: process.env.PATH,
		HOME: homedir(),
		USER: process.env.USER,
		LOGNAME: process.env.LOGNAME,
		SHELL: process.env.SHELL,
		TMPDIR: tmpdir(),
		CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
		// Keeps the API key, when there is one, out of the agent's commands and the hooks.
		CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1",
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
		DISABLE_AUTOUPDATER: "1",
		npm_config_update_notifier: "false",
		npm_config_offline: "true",
		npm_config_cache: npmCache,
	};

	return funding === "api" ? { ...env, ANTHROPIC_API_KEY: apiKey } : env;
}

/** Tool inputs that name a path. */
const pathsOf = (input) => [input.file_path, input.path, input.notebook_path].filter(Boolean);

/** `path` with links resolved, as far as it exists, so `/var` and `/private/var` compare equal. */
function canonical(path) {
	if (existsSync(path)) {
		return realpathSync(path);
	}

	const parent = dirname(path);

	return parent === path ? path : join(canonical(parent), basename(path));
}

/** Denies the file tools any path outside the run's tree; the sandbox covers Bash. */
function confine(work) {
	return async (input) => {
		const outside = pathsOf(input.tool_input).filter((path) =>
			relative(work, canonical(resolve(work, path))).startsWith(".."),
		);

		return outside.length === 0
			? {}
			: {
					hookSpecificOutput: {
						hookEventName: "PreToolUse",
						permissionDecision: "deny",
						permissionDecisionReason: `${outside[0]} is outside the project.`,
					},
				};
	};
}

/** Commits the tree after every tool call, so each step can be measured afterwards. */
function snapshotter(workspace, steps) {
	return async (input) => {
		snapshotGit(workspace, ["add", "-A"]);

		const changed = run(
			"git",
			[
				`--git-dir=${join(workspace.meta, "snapshots.git")}`,
				`--work-tree=${workspace.work}`,
				"diff",
				"--cached",
				"--quiet",
			],
			workspace.work,
		).status;

		if (changed !== 0) {
			snapshotGit(workspace, ["commit", "-q", "-m", `step ${steps.length + 1}`]);
		}

		steps.push({
			at: Date.now(),
			tool: input.tool_name,
			input: input.tool_input,
			snapshot: snapshotGit(workspace, ["rev-parse", "HEAD"]).trim(),
		});

		return {};
	};
}

export function initSnapshots(workspace) {
	const git = join(workspace.meta, "snapshots.git");

	run("git", ["init", "-q", "--bare", git], workspace.meta);

	// Blobs the base tree already has aren't stored again.
	writeFileSync(join(git, "objects/info/alternates"), `${join(baseDir, ".git/objects")}\n`);

	writeFileSync(join(git, "info/exclude"), "/node_modules\n/.git\n");

	snapshotGit(workspace, ["add", "-A"]);

	snapshotGit(workspace, [
		"-c",
		"user.name=bench",
		"-c",
		"user.email=bench@localhost",
		"commit",
		"-q",
		"-m",
		"baseline",
	]);

	snapshotGit(workspace, ["tag", "baseline"]);

	snapshotGit(workspace, ["config", "user.name", "bench"]);

	snapshotGit(workspace, ["config", "user.email", "bench@localhost"]);
}

/** Paths the sandbox keeps Bash from reading: this repository, Claude's config, other runs' plugins. */
const denyRead = () => [
	join(homedir(), "src"),
	join(homedir(), ".claude"),
	join(homedir(), "Documents"),
	// Where the API key file is kept, and other credentials.
	join(homedir(), ".config"),
	join(homedir(), ".ssh"),
	join(tmpdir(), "complexity-hint-eval"),
	bundleDir,
	join(benchDir, "behavior-cache"),
];

/** Why the session's setup doesn't match the protocol's, if it doesn't. */
const setupProblems = (init, { expectedKey, model }) =>
	[
		init.apiKeySource !== expectedKey && `key source ${init.apiKeySource}, expected ${expectedKey}`,
		init.model !== model && `model ${init.model}, expected ${model}`,
		init.tools.join() !== [...TOOLS].sort().join() && `tools ${init.tools.join()}`,
		init.mcp_servers.length > 0 && "MCP servers loaded",
	].filter(Boolean);

/**
 * Reads the session's messages into `stream` and `record`, stopping it if its setup is
 * wrong, and returns its result message, if there was one.
 */
async function consume(session, record, { stream, ...expected }) {
	let result;

	try {
		for await (const message of session) {
			appendFileSync(stream, `${JSON.stringify(message)}\n`);

			if (message.type === "system" && message.subtype === "init") {
				record.claudeCode = message.claude_code_version;

				record.apiKeySource = message.apiKeySource;

				const problems = setupProblems(message, expected);

				if (problems.length > 0) {
					record.aborted = problems;

					await session.interrupt();

					break;
				}
			}

			// The subscription's usage, as the service reports it during the run.
			if (message.type === "rate_limit_event") {
				record.rateLimits.push(message.rate_limit_info);
			}

			if (message.type === "assistant") {
				const seen = message.message.model;

				record.modelsSeen[seen] = (record.modelsSeen[seen] ?? 0) + 1;
			}

			if (message.type === "result") {
				result = message;
			}
		}
	} catch (error) {
		record.thrown = String(error).slice(0, 1000);
	}

	return result;
}

/**
 * Runs `task` under `arm` with `model`, and returns the run's record. `funding` is
 * "subscription" or "api"; the session's reported key source must match it.
 */
export async function runAgent({
	task,
	arm,
	model,
	effort,
	funding,
	apiKey,
	maxTurns,
	maxBudgetUsd,
	label,
}) {
	const workspace = createWorkspace(arm);
	const stream = join(workspace.meta, "stream.jsonl");
	const steps = [];

	initSnapshots(workspace);

	const lint = run("npx", ["oxlint", "--format", "agent", task.file], workspace.work);
	const text = prompt(task, lint.stdout + lint.stderr);
	const expectedKey = funding === "api" ? "ANTHROPIC_API_KEY" : "none";

	const record = {
		id: workspace.id,
		label,
		rule: task.rule,
		file: task.file,
		arm,
		model,
		effort,
		funding,
		caps: { maxTurns, maxBudgetUsd },
		sdk: SDK_VERSION,
		prompt: text,
		startedAt: new Date().toISOString(),
		modelsSeen: {},
		rateLimits: [],
	};

	const session = query({
		prompt: text,
		options: {
			cwd: workspace.work,
			model,
			effort,
			tools: TOOLS,
			disallowedTools: ["WebFetch", "WebSearch", "Agent", "Task", "NotebookEdit"],
			// Only the tree's own .claude/settings.json, which holds the README's lint hook.
			settingSources: ["project"],
			strictMcpConfig: true,
			mcpServers: {},
			persistSession: false,
			includeHookEvents: true,
			systemPrompt: { type: "preset", preset: "claude_code" },
			// The scrub above rules out bypassing permissions, so the tools are approved by name.
			permissionMode: "default",
			allowedTools: TOOLS,
			env: environment(funding, apiKey, workspace.npmCache),
			maxTurns,
			maxBudgetUsd,
			sandbox: {
				enabled: true,
				failIfUnavailable: true,
				allowUnsandboxedCommands: false,
				network: { allowedDomains: [], strictAllowlist: true },
				filesystem: { denyRead: denyRead(), allowWrite: [workspace.npmCache] },
			},
			hooks: {
				PreToolUse: [{ hooks: [confine(workspace.work)] }],
				PostToolUse: [{ hooks: [snapshotter(workspace, steps)] }],
			},
		},
	});

	const result = await consume(session, record, { stream, expectedKey, model });

	record.endedAt = new Date().toISOString();

	record.steps = steps.length;

	writeFileSync(join(workspace.meta, "steps.json"), JSON.stringify(steps, null, "\t"));

	if (result) {
		record.result = {
			subtype: result.subtype,
			stopReason: result.stop_reason,
			turns: result.num_turns,
			costUsd: result.total_cost_usd,
			modelUsage: result.modelUsage,
			usage: result.usage,
			durationMs: result.duration_ms,
			durationApiMs: result.duration_api_ms,
			errors: result.errors,
			text: result.subtype === "success" ? result.result : undefined,
		};
	}

	// The key must never reach a record; a run whose records hold it stops the benchmark.
	record.keyLeaked =
		apiKey !== undefined &&
		["stream.jsonl", "steps.json"].some((file) =>
			readFileSync(join(workspace.meta, file), "utf8").includes(apiKey),
		);

	record.outcome = record.keyLeaked
		? { kind: "aborted", reason: "the API key appears in the run's records" }
		: classify(record);

	writeFileSync(join(workspace.meta, "run.json"), JSON.stringify(record, null, "\t"));

	return { record, workspace };
}

/**
 * Scores a finished run whose result is the model's, and saves its record. Kept apart from
 * the run, since the behavior check is slow and runs at the same time would wait on it.
 */
export function scoreRun({ record, workspace }, task) {
	if (record.outcome.kind === "model") {
		record.score = score(workspace, task);
	}

	writeFileSync(join(workspace.meta, "run.json"), JSON.stringify(record, null, "\t"));

	return record;
}

/**
 * Whether the run's result is the model's, or the service's: a model's result counts, and
 * a service failure is re-run once. "stop" means the account can't run more.
 */
export function classify(record) {
	const text = [record.thrown, record.result?.text, ...(record.result?.errors ?? [])].join("\n");

	if (record.aborted) {
		return { kind: "aborted", reason: record.aborted.join("; ") };
	}

	if (STOP.test(text)) {
		return { kind: "stop", reason: text.match(STOP)[0] };
	}

	const subtype = record.result?.subtype;

	if (
		["success", "error_max_turns", "error_max_budget_usd"].includes(subtype) &&
		!INFRASTRUCTURE.test(record.result?.text ?? "")
	) {
		return { kind: "model", reason: subtype };
	}

	if (record.result?.stopReason === "refusal") {
		return { kind: "infrastructure", reason: "refusal" };
	}

	return { kind: "infrastructure", reason: subtype ?? (text.trim().split("\n")[0] || "no result") };
}

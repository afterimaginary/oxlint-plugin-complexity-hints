// One run of the agent benchmark: a Claude Agent SDK session in a fresh tree, asked to fix
// the task's lint error, with the README's lint hook. Every message and a snapshot after
// every tool call are kept, then the final tree is scored. See
// docs/designs/agent-benchmark.md.
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	lstatSync,
	readdirSync,
	readFileSync,
	realpathSync,
	renameSync,
	writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { root, run } from "../eval-repos.mjs";
import { baseDir, benchDir, bundleDir, GIT_ENV } from "./prepare.mjs";
import { resultsDir } from "./records.mjs";
import { ignoredFiles, score, snapshotGit } from "./score.mjs";
import { createWorkspace, runsDir } from "./workspace.mjs";

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

const API_ERROR = /API Error: (\d{3}).*/;

/** Result subtypes that are the model's doing: it finished, or ran out of turns or budget. */
const MODEL_OUTCOMES = ["success", "error_max_turns", "error_max_budget_usd"];

const STOP = /credit balance is too low|usage limit|spend limit|out of (?:extra )?usage/i;

/**
 * The run's environment, built from nothing so the launching shell's settings (a Claude
 * Code session's among them) don't reach the agent. An API key is passed only when
 * `funding` is "api".
 */
export function environment(funding, apiKey, workspace) {
	const env = {
		PATH: process.env.PATH,
		// On the API, an empty home of the run's own, so the user's name, git identity and
		// dotfiles stay out of what the agent sees and what the records keep. The
		// subscription's login lives in the real one.
		HOME: funding === "api" ? workspace.home : homedir(),
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
		npm_config_cache: workspace.npmCache,
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

/** Commits the tree if it changed since the last snapshot, and returns the snapshot. */
function snapshot(workspace, message) {
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
		{ env: GIT_ENV },
	).status;

	if (changed !== 0) {
		snapshotGit(workspace, ["commit", "-q", "-m", message]);
	}

	return snapshotGit(workspace, ["rev-parse", "HEAD"]).trim();
}

/**
 * Commits the tree after every tool call, failed ones included (a command that edits the
 * file and then exits non-zero still edited it), so each step can be measured afterwards.
 */
function snapshotter(workspace, steps) {
	return async (input) => {
		steps.push({
			at: Date.now(),
			tool: input.tool_name,
			input: input.tool_input,
			failed: input.hook_event_name === "PostToolUseFailure",
			snapshot: snapshot(workspace, `step ${steps.length + 1}`),
		});

		return {};
	};
}

export function initSnapshots(workspace) {
	const git = join(workspace.meta, "snapshots.git");

	run("git", ["init", "-q", "--bare", git], workspace.meta, { env: GIT_ENV });

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

	writeFileSync(
		join(workspace.meta, "ignored-baseline.json"),
		JSON.stringify(ignoredFiles(workspace)),
	);

	snapshotGit(workspace, ["config", "user.name", "bench"]);

	snapshotGit(workspace, ["config", "user.email", "bench@localhost"]);
}

/** `path`, created if need be, with links resolved, as the sandbox compares them. */
function real(path) {
	mkdirSync(path, { recursive: true });

	return realpathSync(path);
}

/**
 * Paths the sandbox keeps Bash from reading: this repository, Claude's config and the
 * user's, the plugins, and every other run's tree and results, including the base tree's
 * sources. The run's own folder is read again through `allowRead`.
 */
const denyRead = () => [
	join(homedir(), "src"),
	join(homedir(), ".claude"),
	join(homedir(), ".claude.json"),
	join(homedir(), ".npmrc"),
	join(homedir(), "Documents"),
	// Where the API key file is kept, and other credentials.
	join(homedir(), ".config"),
	join(homedir(), ".ssh"),
	join(tmpdir(), "complexity-hint-eval"),
	real(bundleDir),
	real(join(benchDir, "behavior-cache")),
	real(join(benchDir, "corpus")),
	real(resultsDir),
	real(runsDir),
	real(join(baseDir, "lib")),
	real(join(baseDir, "tests")),
];

/** The system temp folder; agents write scripts there by fixed names. */
const SYSTEM_TMP = realpathSync("/tmp");

/** Bash's sandbox for a run: no network, and none of the reads `denyRead` lists but its own folder. */
export const sandbox = (workspace) => ({
	enabled: true,
	failIfUnavailable: true,
	allowUnsandboxedCommands: false,
	network: { allowedDomains: [], strictAllowlist: true },
	filesystem: {
		denyRead: denyRead(),
		allowRead: [workspace.dir],
		// Agents write scripts to /tmp, as they did in the probe; it's allowed explicitly, so
		// the sandbox's default can't change it, and `collectTmp` clears it between runs.
		allowWrite: [workspace.npmCache, SYSTEM_TMP],
	},
});

/** Top-level entries in the system temp folder. */
const tmpEntries = () => new Set(readdirSync(SYSTEM_TMP));

/**
 * Moves what the run left in the system temp folder into its records, so the next run
 * can't read it: entries its messages name that it created, and files that were there
 * before and that it rewrote. Folders that were there before stay, since other programs
 * keep theirs there; Claude Code's own are never touched.
 */
function collectTmp(before, startedAt, stream, meta) {
	// Only what the agent itself named: the session's own messages name Claude Code's files.
	const named = JSON.stringify(toolCalls(stream).map((call) => call.input));

	const left = [...tmpEntries()].filter((name) => {
		if (/^(?:claude|cc-)/.test(name) || !named.includes(`/tmp/${name}`)) {
			return false;
		}

		const stat = lstatSync(join(SYSTEM_TMP, name));

		return before.has(name)
			? stat.isFile() && stat.mtimeMs >= startedAt
			: stat.isFile() || stat.isDirectory() || stat.isSymbolicLink();
	});

	if (left.length > 0) {
		mkdirSync(join(meta, "tmp"));
	}

	for (const name of left) {
		renameSync(join(SYSTEM_TMP, name), join(meta, "tmp", name));
	}

	return left;
}

const messagesOf = (stream) =>
	readFileSync(stream, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((line) => JSON.parse(line));

/** The agent's tool calls, from the message stream. */
const toolCalls = (stream) =>
	messagesOf(stream)
		.filter((message) => message.type === "assistant")
		.flatMap((message) => message.message.content)
		.filter((block) => block.type === "tool_use");

/** Tool calls, the agent's own lint runs and the hook's, counted from the message stream. */
function activity(stream) {
	const messages = messagesOf(stream);
	const calls = toolCalls(stream);

	return {
		toolCalls: calls.length,
		lintRuns: calls.filter(
			(call) => call.name === "Bash" && /\boxlint\b/.test(call.input.command ?? ""),
		).length,
		hookRuns: messages.filter(
			(message) => message.type === "system" && message.subtype === "hook_response",
		).length,
	};
}

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

	writeFileSync(stream, "");

	initSnapshots(workspace);

	const lint = run("npx", ["oxlint", "--format", "agent", task.file], workspace.work);
	const text = prompt(task, lint.stdout + lint.stderr);

	// The prompt quotes the arm's message exactly as the task records it.
	if (!text.includes(task.messages[arm])) {
		throw new Error(`The prompt for ${task.rule}:${arm} doesn't quote the arm's message:\n${text}`);
	}

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

	const before = tmpEntries();

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
			env: environment(funding, apiKey, workspace),
			maxTurns,
			maxBudgetUsd,
			sandbox: sandbox(workspace),
			hooks: {
				PreToolUse: [{ hooks: [confine(workspace.work)] }],
				PostToolUse: [{ hooks: [snapshotter(workspace, steps)] }],
				PostToolUseFailure: [{ hooks: [snapshotter(workspace, steps)] }],
			},
		},
	});

	const result = await consume(session, record, { stream, expectedKey, model });

	record.endedAt = new Date().toISOString();

	// The tree as the session left it, whatever its last step was, is what's scored.
	record.finalSnapshot = snapshot(workspace, "final");

	record.steps = steps.length;

	Object.assign(record, activity(stream));

	record.tmpFiles = collectTmp(before, Date.parse(record.startedAt), stream, workspace.meta);

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

	record.keyLeaked =
		apiKey !== undefined && (leaks(workspace, apiKey) || JSON.stringify(record).includes(apiKey));

	record.outcome = record.keyLeaked
		? { kind: "aborted", reason: "the API key appears in the run's records" }
		: classify(record);

	writeFileSync(join(workspace.meta, "run.json"), JSON.stringify(record, null, "\t"));

	return { record, workspace };
}

/**
 * Whether the API key appears in any of the run's records. It must never reach one; a run
 * whose records hold it stops the benchmark and isn't kept.
 */
export function leaks(workspace, apiKey) {
	if (apiKey === undefined) {
		return false;
	}

	const inFiles = readdirSync(workspace.meta, { recursive: true, withFileTypes: true })
		.filter((entry) => entry.isFile() && !entry.parentPath.includes("snapshots.git"))
		.some((entry) => readFileSync(join(entry.parentPath, entry.name), "utf8").includes(apiKey));

	// The snapshots' objects are compressed, so their contents are read through git.
	return inFiles || snapshotGit(workspace, ["log", "-p", "--all"]).includes(apiKey);
}

/**
 * Scores a finished run whose result is the model's, and saves its record. Kept apart from
 * the run, since the behavior check is slow and runs at the same time would wait on it.
 */
export function scoreRun({ record, workspace }, task) {
	if (record.outcome.kind === "model") {
		// A bug in the scoring mustn't lose a run that's been paid for: the run is kept, marked,
		// and can be scored again once the bug is fixed.
		try {
			record.score = score(workspace, task);
		} catch (error) {
			record.score = { success: false, error: String(error.stack ?? error).slice(0, 2000) };
		}
	}

	writeFileSync(join(workspace.meta, "run.json"), JSON.stringify(record, null, "\t"));

	return record;
}

/**
 * Whether the run's result is the model's, or the service's: a model's result counts, and
 * a service failure is re-run once. "stop" means the account can't run more.
 */
export function classify(record) {
	// What the service and the SDK said, as opposed to what the model wrote.
	const service = [record.thrown, ...(record.result?.errors ?? [])].join("\n");
	const text = [service, record.result?.text].join("\n");

	if (record.aborted) {
		return { kind: "aborted", reason: record.aborted.join("; ") };
	}

	if (STOP.test(text)) {
		return { kind: "stop", reason: text.match(STOP)[0] };
	}

	// An error in place of a reply: rate limits and outages pass, anything else means the
	// account or the request is wrong, and no further run would go better.
	const status = API_ERROR.exec(text);

	if (status) {
		return status[1] === "429" || status[1].startsWith("5")
			? { kind: "infrastructure", reason: `API error ${status[1]}` }
			: { kind: "stop", reason: status[0].slice(0, 300) };
	}

	if (Object.keys(record.modelsSeen).every((model) => model === "<synthetic>")) {
		return { kind: "infrastructure", reason: "no reply from the model" };
	}

	if (record.result?.stopReason === "refusal") {
		return { kind: "infrastructure", reason: "refusal" };
	}

	const subtype = record.result?.subtype;

	if (MODEL_OUTCOMES.includes(subtype) && !INFRASTRUCTURE.test(service)) {
		return { kind: "model", reason: subtype };
	}

	return {
		kind: "infrastructure",
		reason: subtype ?? (service.trim().split("\n")[0] || "no result"),
	};
}

// Reading a Claude Code `PostToolUse` hook's input. See "Claude Code hook" in
// docs/specs/scoped-checker.md.
import { SetupError } from "./changes.ts";

interface HookInput {
	tool_input?: { file_path?: unknown };
	tool_response?: { bashEditDiff?: { changedFiles?: unknown } };
}

/**
 * The absolute paths of the files a tool call changed: an `Edit` or `Write` call's file,
 * or the files a `Bash` command changed, when Claude Code recorded them.
 */
export function hookFiles(input: string): string[] {
	let parsed: unknown;

	try {
		parsed = JSON.parse(input);
	} catch {
		parsed = undefined;
	}

	if (typeof parsed !== "object" || parsed === null) {
		throw new SetupError("--claude-code-hook expects a Claude Code hook's JSON input on stdin");
	}

	const { tool_input, tool_response } = parsed as HookInput;
	const { file_path } = tool_input ?? {};
	const changed = tool_response?.bashEditDiff?.changedFiles;
	const files = typeof file_path === "string" ? [file_path] : changed;

	return Array.isArray(files) ? files.filter((file) => typeof file === "string") : [];
}

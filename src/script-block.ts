import { readFileSync } from "node:fs";

/**
 * Files whose embedded scripts Oxlint lints one block at a time. The rule sees only the
 * block's text, so every position it reads is relative to the block. Oxlint corrects the
 * diagnostic's own location, but the plugin API doesn't say where the block sits.
 */
const EMBEDDED_SCRIPTS = [".vue", ".svelte", ".astro"];

/** How far a block is from the start of its file: whole lines, then columns on its first line. */
export interface BlockStart {
	lines: number;
	columns: number;
}

const AT_FILE_START: BlockStart = { lines: 0, columns: 0 };

/**
 * Where `text` starts in the file on disk, found verbatim. The start of the file when
 * that fails: not an embedded script, an unreadable file, or a block that no longer
 * matches it, such as an unsaved editor buffer. Text that appears more than once maps to
 * where it first appears.
 */
export function scriptBlockStart(filename: string, text: string): BlockStart {
	if (!EMBEDDED_SCRIPTS.some((extension) => filename.endsWith(extension))) {
		return AT_FILE_START;
	}

	let file: string;

	try {
		file = readFileSync(filename, "utf8");
	} catch {
		return AT_FILE_START;
	}

	const start = file.indexOf(text);

	if (start <= 0) {
		return AT_FILE_START;
	}

	const before = file.slice(0, start);

	return {
		lines: before.split("\n").length - 1,
		columns: start - (before.lastIndexOf("\n") + 1),
	};
}

/**
 * Moves the positions in diagnostic text from the block to the file. Positions are
 * always worded `line N`, `lines N-M` or `line N, column M`; see docs/specs/diagnostics.md.
 */
export function toFilePositions(text: string, { lines, columns }: BlockStart): string {
	if (lines === 0 && columns === 0) {
		return text;
	}

	return text.replace(
		/\b(lines?) (\d+)(?:-(\d+))?(?:, column (\d+))?/g,
		(_match, word: string, first: string, last?: string, column?: string) => {
			const line = Number(first);
			const range = last ? `-${Number(last) + lines}` : "";
			// Only the block's first line shares a line with what comes before it.
			const at = column ? `, column ${Number(column) + (line === 1 ? columns : 0)}` : "";

			return `${word} ${line + lines}${range}${at}`;
		},
	);
}

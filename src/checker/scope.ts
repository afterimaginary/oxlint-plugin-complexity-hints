// Which diagnostics a change is responsible for. See "What it reports" in
// docs/specs/scoped-checker.md.
import { readFileSync } from "node:fs";
import { touches, type Lines } from "./changes.ts";
import type { Diagnostic } from "./oxlint.ts";

/** A run of lines, both ends included. */
export interface Span {
	first: number;
	last: number;
}

/** What the checker reads from a `cognitive-complexity` message. */
export interface Parsed {
	/** The lines the function spans. */
	function: Span;
	/** The lines the fix points at, or the whole function when it names none. */
	target: Span;
}

// The label is free text, so the span is the last `at line(s)` before the stable part.
const MESSAGE =
	/^.* at lines? (\d+)(?:-(\d+))? has cognitive complexity \d+, over the max of \d+; main contributors: .*?; fix: (.*)\.$/;

// Every fix names its target first: `move lines 19-22 …`, `invert the 'if' at line 3 …`.
const POSITION = /\blines? (\d+)(?:-(\d+))?/;

// The fallback (`split the code around line 98 …`, `replace the else-if chain …`) gives a
// direction, not a change at its line, so it targets the whole function.
const FALLBACK = /^(?:split|replace) /;

function span(first: string, last: string | undefined): Span {
	return { first: Number(first), last: Number(last ?? first) };
}

/** The spans in a `cognitive-complexity` message, or undefined for any other message. */
export function parseMessage(message: string): Parsed | undefined {
	const [, first, last, fix] = MESSAGE.exec(message) ?? [];

	if (first === undefined || fix === undefined) {
		return undefined;
	}

	const whole = span(first, last);
	const [, targetFirst, targetLast] = FALLBACK.test(fix) ? [] : (POSITION.exec(fix) ?? []);

	return { function: whole, target: targetFirst ? span(targetFirst, targetLast) : whole };
}

const isMaxParams = (code: string) => code.endsWith("(max-params)");

/** The lines a diagnostic's label covers, counted from its byte offsets in `text`. */
function labelSpan(diagnostic: Diagnostic, text: Buffer): Span {
	const { offset, length, line } = diagnostic.labels[0]!.span;
	const covered = text.subarray(offset, offset + length);

	return { first: line, last: line + covered.filter((byte) => byte === 0x0a).length };
}

/**
 * `span`'s lines, less those strictly inside `holes`. A nested function's first and last
 * lines usually hold code of the function around it too, such as the call it's passed to.
 */
function ownLines({ first, last }: Span, holes: readonly Span[]): Set<number> {
	const lines = new Set<number>();

	for (let line = first; line <= last; line++) {
		if (!holes.some((hole) => hole.first < line && line < hole.last)) {
			lines.add(line);
		}
	}

	return lines;
}

function* range({ first, last }: Span): Generator<number> {
	for (let line = first; line <= last; line++) {
		yield line;
	}
}

// Strictly: a function with the same span is the function itself.
const contains = (outer: Span, inner: Span) =>
	outer.first <= inner.first &&
	inner.last <= outer.last &&
	(outer.first !== inner.first || outer.last !== inner.last);

export interface Scoped {
	blocks: Diagnostic[];
	notes: Diagnostic[];
}

/**
 * Sorts one file's diagnostics into what blocks and what is only a note, leaving out
 * what the change didn't touch. `changed` is the file's changed lines, and `path` where
 * to read it, for `max-params`' span.
 */
export function scopeFile(
	diagnostics: readonly Diagnostic[],
	changed: Lines,
	path: string,
	strict: boolean,
): Scoped {
	const scoped: Scoped = { blocks: [], notes: [] };
	const parsed = diagnostics.map((diagnostic) => parseMessage(diagnostic.message));
	const functions = parsed.flatMap((each) => (each ? [each.function] : []));

	const keep = (diagnostic: Diagnostic, blocks: boolean) => {
		const asError = blocks && diagnostic.severity === "error";

		(asError ? scoped.blocks : scoped.notes).push(diagnostic);
	};

	for (const [index, diagnostic] of diagnostics.entries()) {
		const message = parsed[index];

		if (message) {
			const own = ownLines(
				message.function,
				functions.filter((other) => contains(message.function, other)),
			);

			if (touches(changed, own)) {
				keep(diagnostic, strict || touches(changed, range(message.target)));
			}
		} else if (isMaxParams(diagnostic.code)) {
			const params = labelSpan(diagnostic, readFileSync(path));

			if (touches(changed, range(params))) {
				keep(diagnostic, true);
			}
		}
	}

	return scoped;
}

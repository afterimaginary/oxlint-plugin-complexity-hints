import type { Increment } from "./scoring.ts";

/** One contributor in a message: a single increment, or several grouped together. */
export interface Contributor {
	kind: string;
	text: string;
	points: number;
	line: number;
}

const SHOWN = 3;

function groupBy(increments: readonly Increment[], key: (increment: Increment) => string) {
	const groups = new Map<string, Increment[]>();

	for (const increment of increments) {
		const group = groups.get(key(increment));

		if (group) {
			group.push(increment);
		} else {
			groups.set(key(increment), [increment]);
		}
	}

	return [...groups.values()];
}

function counted(count: number, kind: string): string {
	return count === 1 ? kind : `${count} ${kind}`;
}

function sum(increments: readonly Increment[]): number {
	return increments.reduce((total, increment) => total + increment.points, 0);
}

/** Increments with a nesting bonus, one entry each, merged when kind, line and points match. */
function nestedContributors(increments: readonly Increment[]): Contributor[] {
	const nested = increments.filter((increment) => increment.nesting > 0);

	return groupBy(nested, ({ kind, line, points }) => `${kind} ${line} ${points}`).map((group) => {
		const { kind, line, nesting } = group[0]!;
		const points = sum(group);

		return {
			kind,
			text: `${counted(group.length, kind)} at line ${line} (+${points}, nested ${nesting} deep)`,
			points,
			line,
		};
	});
}

/** Increments without a nesting bonus, one entry per kind. */
function flatContributors(increments: readonly Increment[]): Contributor[] {
	const flat = increments.filter((increment) => increment.nesting === 0);

	return groupBy(flat, ({ kind }) => kind).map((group) => {
		const lines = group.map((increment) => increment.line);
		const first = Math.min(...lines);
		const last = Math.max(...lines);
		const where = first === last ? `at line ${first}` : `at lines ${first}-${last}`;
		const points = sum(group);

		return {
			kind: group[0]!.kind,
			text: `${counted(group.length, group[0]!.kind)} ${where} (+${points})`,
			points,
			line: first,
		};
	});
}

/** Every contributor, heaviest first, then earliest. */
export function rankContributors(increments: readonly Increment[]): Contributor[] {
	return [...nestedContributors(increments), ...flatContributors(increments)].sort(
		(a, b) => b.points - a.points || a.line - b.line,
	);
}

/** The heaviest contributors as message text: see "Contributors" in docs/specs/diagnostics.md. */
export function describeContributors(ranked: readonly Contributor[]): string {
	return ranked
		.slice(0, SHOWN)
		.map((contributor) => contributor.text)
		.join(", ");
}

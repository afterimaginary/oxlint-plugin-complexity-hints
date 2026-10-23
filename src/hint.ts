import type { ESTree } from "@oxlint/plugins";
import type { Contributor } from "./contributors.ts";
import { enclosingUnit, isElseIf, type FunctionUnit, type Increment } from "./scoring.ts";

/** A stretch of a unit that could move into a new function. */
interface Region {
	start: number;
	end: number;
	firstLine: number;
	lastLine: number;
	/** The nesting level the region's contents sit at, which a move takes away. */
	depth: number;
	/** What the region is, such as "the body of the 'for' at line 3"; absent for a run of statements. */
	what?: string;
	/** For a ternary, its 1-based column, since a line can hold several. */
	ternaryColumn?: number;
}

function span(first: ESTree.Node, last: ESTree.Node) {
	return {
		start: first.start,
		end: last.end,
		firstLine: first.loc.start.line,
		lastLine: last.loc.end.line,
	};
}

/** The statements of a body, or nothing when it is empty. */
function bodyRegion(body: ESTree.Node | null, what: string): Region | undefined {
	if (!body) {
		return undefined;
	}

	const statements = body.type === "BlockStatement" ? body.body : [body];

	if (statements.length === 0) {
		return undefined;
	}

	return {
		...span(statements[0]!, statements.at(-1)!),
		depth: enclosingUnit(body)?.nesting ?? 0,
		what,
	};
}

function caseRegions(node: ESTree.SwitchStatement): Region[] {
	return node.cases.flatMap((switchCase) => {
		if (switchCase.consequent.length === 0) {
			return [];
		}

		const label = switchCase.test ? "'case'" : "'default'";

		return {
			...span(switchCase.consequent[0]!, switchCase.consequent.at(-1)!),
			depth: enclosingUnit(switchCase)?.nesting ?? 0,
			what: `the ${label} at line ${switchCase.loc.start.line}`,
		};
	});
}

function tryRegions(node: ESTree.CatchClause): (Region | undefined)[] {
	// A `catch` always belongs to a `try`.
	const statement = node.parent as ESTree.TryStatement;
	const line = (block: ESTree.Node) => block.loc.start.line;

	return [
		bodyRegion(statement.block, `the 'try' block at line ${line(statement.block)}`),
		bodyRegion(node.body, `the 'catch' block at line ${line(node)}`),
		bodyRegion(
			statement.finalizer,
			`the 'finally' block at line ${line(statement.finalizer ?? node)}`,
		),
	];
}

/** The regions an increment's construct offers: its bodies, cases or, for a nested ternary, itself. */
function regionsOf({ kind, node, line, nesting }: Increment): (Region | undefined)[] {
	switch (node.type) {
		case "IfStatement":
			if (kind === "'else'") {
				return [];
			}

			return [
				bodyRegion(node.consequent, `the body of the ${kind} at line ${line}`),
				node.alternate && !isElseIf(node.alternate)
					? bodyRegion(node.alternate, `the 'else' branch at line ${node.alternate.loc.start.line}`)
					: undefined,
			];

		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
		case "WhileStatement":
		case "DoWhileStatement":
			return [bodyRegion(node.body, `the body of the ${kind} at line ${line}`)];

		case "CatchClause":
			return tryRegions(node);

		case "SwitchStatement":
			return caseRegions(node);

		case "ConditionalExpression":
			return nesting > 0
				? [{ ...span(node, node), depth: nesting, ternaryColumn: node.loc.start.column + 1 }]
				: [];

		default:
			return [];
	}
}

/** Every run of consecutive statements in the unit's body, short of the whole body. */
function statementRuns(unit: FunctionUnit): Region[] {
	const statements = unit.body?.type === "BlockStatement" ? unit.body.body : [];
	const runs: Region[] = [];

	for (let from = 0; from < statements.length; from++) {
		for (let to = from; to < statements.length; to++) {
			if (to - from + 1 < statements.length) {
				runs.push({ ...span(statements[from]!, statements[to]!), depth: 0 });
			}
		}
	}

	return runs;
}

/** What each function would score if `region` moved out unchanged. */
function split(region: Region, increments: readonly Increment[], total: number) {
	let removed = 0;
	let moved = 0;

	for (const increment of increments) {
		if (increment.node.start >= region.start && increment.node.end <= region.end) {
			removed += increment.points;

			moved += increment.nested ? increment.points - region.depth : increment.points;
		}
	}

	return { remaining: total - removed, moved };
}

function lines({ firstLine, lastLine }: Region): string {
	return firstLine === lastLine ? `line ${firstLine}` : `lines ${firstLine}-${lastLine}`;
}

function moveText(region: Region, remaining: number, moved: number): string {
	if (region.ternaryColumn) {
		return `move the '?:' at line ${region.firstLine}, column ${region.ternaryColumn}, into a helper function; this one drops to ${remaining} and the helper scores ${moved}`;
	}

	const what = region.what ? ` (${region.what})` : "";

	return `move ${lines(region)}${what} into a new function; this one drops to ${remaining} and the new one scores ${moved}`;
}

/** The hint when no region helps, worded by the heaviest contributor. */
function fallbackText({ kind, line }: Contributor): string {
	if (kind === "'&&'") {
		return `split the condition at line ${line} into named helper functions`;
	}

	if (kind === "'else if'") {
		return `replace the else-if chain at line ${line} with a switch or a lookup table`;
	}

	return `split the code around line ${line} into smaller functions`;
}

interface Option {
	region: Region;
	remaining: number;
	moved: number;
	/** The higher of the two scores after the move; lower is better. */
	score: number;
}

/** Orders options best first: the lowest score, then the earliest, then the shortest region. */
function compare(a: Option, b: Option): number {
	const length = (option: Option) => option.region.end - option.region.start;

	return a.score - b.score || a.region.firstLine - b.region.firstLine || length(a) - length(b);
}

/**
 * One concrete change: move the region that best splits the score, so that both
 * functions end up lower than this one is now. See "Fix" in docs/specs/diagnostics.md.
 */
export function suggestFix(
	unit: FunctionUnit,
	increments: readonly Increment[],
	heaviest: Contributor,
): string {
	const total = increments.reduce((sum, increment) => sum + increment.points, 0);
	const regions = [...increments.flatMap(regionsOf), ...statementRuns(unit)];

	const [best] = regions
		.filter((region) => region !== undefined)
		.map((region): Option => {
			const { remaining, moved } = split(region, increments, total);

			return {
				region,
				remaining,
				moved,
				score: Math.max(remaining, moved),
			};
		})
		.filter((option) => option.score < total)
		.sort(compare);

	return best ? moveText(best.region, best.remaining, best.moved) : fallbackText(heaviest);
}

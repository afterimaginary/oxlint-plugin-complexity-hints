import type { ESTree } from "@oxlint/plugins";
import { kindText, type Contributor } from "./contributors.ts";
import { enclosingUnit, isElseIf, type FunctionUnit, type Increment } from "./scoring.ts";

/** A stretch of a unit that could move into a new function. */
interface Region {
	start: number;
	end: number;
	firstLine: number;
	lastLine: number;
	/** The nesting level the region's contents sit at, which a move takes away. */
	depth: number;
	/** The fix's wording, given what each function would then score. */
	text: (remaining: number, moved: number) => string;
}

function span(first: ESTree.Node, last: ESTree.Node) {
	return {
		start: first.start,
		end: last.end,
		firstLine: first.loc.start.line,
		lastLine: last.loc.end.line,
	};
}

function lines(firstLine: number, lastLine: number): string {
	return firstLine === lastLine ? `line ${firstLine}` : `lines ${firstLine}-${lastLine}`;
}

/** `move lines 5-8 (what) into a new function; …` for a region of whole statements. */
function statementsRegion(
	statements: readonly ESTree.Node[],
	depth: number,
	what?: string,
): Region[] {
	if (statements.length === 0) {
		return [];
	}

	const where = span(statements[0]!, statements.at(-1)!);
	const described = what ? ` (${what})` : "";

	return [
		{
			...where,
			depth,
			text: (remaining, moved) =>
				`move ${lines(where.firstLine, where.lastLine)}${described} into a new function; this one drops to ${remaining} and the new one scores ${moved}`,
		},
	];
}

function bodyRegion(body: ESTree.Node | null, what: string): Region[] {
	if (!body) {
		return [];
	}

	const statements = body.type === "BlockStatement" ? body.body : [body];

	return statementsRegion(statements, enclosingUnit(body)?.nesting ?? 0, what);
}

function caseRegions(node: ESTree.SwitchStatement): Region[] {
	return node.cases.flatMap((switchCase) => {
		const statements = [...switchCase.consequent];
		const last = statements.at(-1);

		// The `break` that ends a case stays behind.
		if (last?.type === "BreakStatement" && !last.label) {
			statements.pop();
		}

		const label = switchCase.test ? "'case'" : "'default'";

		return statementsRegion(
			statements,
			enclosingUnit(switchCase)?.nesting ?? 0,
			`the ${label} at line ${switchCase.loc.start.line}`,
		);
	});
}

function tryRegions(node: ESTree.CatchClause): Region[] {
	// A `catch` always belongs to a `try`.
	const statement = node.parent as ESTree.TryStatement;
	const line = (block: ESTree.Node) => block.loc.start.line;

	return [
		...bodyRegion(statement.block, `the 'try' block at line ${line(statement.block)}`),
		...bodyRegion(node.body, `the 'catch' block at line ${line(node)}`),
		...bodyRegion(
			statement.finalizer,
			`the 'finally' block at line ${line(statement.finalizer ?? node)}`,
		),
	];
}

function ternaryRegion(node: ESTree.Node, depth: number): Region[] {
	const where = `line ${node.loc.start.line}, column ${node.loc.start.column + 1}`;

	return [
		{
			...span(node, node),
			depth,
			text: (remaining, moved) =>
				`move the '?:' at ${where}, into a helper function; this one drops to ${remaining} and the helper scores ${moved}`,
		},
	];
}

/** Where a construct is: its line, plus its column when another of its kind shares the line. */
function position(increment: Increment, increments: readonly Increment[]): string {
	const { kind, line, node } = increment;

	const shared = increments.some(
		(other) => other !== increment && other.kind === kind && other.line === line,
	);

	return shared ? `line ${line}, column ${node.loc.start.column + 1}` : `line ${line}`;
}

/** The regions an increment's construct offers: its bodies, cases or, for a nested ternary, itself. */
function regionsOf(increment: Increment, increments: readonly Increment[]): Region[] {
	const { kind, node, nesting } = increment;
	const at = position(increment, increments);

	switch (node.type) {
		case "IfStatement":
			// An `else` increment sits on its `if`, which offers its regions once.
			if (kind === "else") {
				return [];
			}

			return [
				...bodyRegion(node.consequent, `the body of the ${kindText(kind)} at ${at}`),
				...(node.alternate && !isElseIf(node.alternate)
					? bodyRegion(node.alternate, `the 'else' branch at line ${node.alternate.loc.start.line}`)
					: []),
			];

		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
		case "WhileStatement":
		case "DoWhileStatement":
			return bodyRegion(node.body, `the body of the ${kindText(kind)} at ${at}`);

		case "CatchClause":
			return tryRegions(node);

		case "SwitchStatement":
			return caseRegions(node);

		case "ConditionalExpression":
			return nesting > 0 ? ternaryRegion(node, nesting) : [];

		default:
			return [];
	}
}

interface Option {
	region: Region;
	remaining: number;
	moved: number;
	/** The higher of the two scores after the move; lower is better. */
	score: number;
}

function option(region: Region, remaining: number, moved: number): Option {
	return {
		region,
		remaining,
		moved,
		score: Math.max(remaining, moved),
	};
}

/** What each function would score if `region` moved out unchanged. */
function evaluate(region: Region, increments: readonly Increment[], total: number): Option {
	let removed = 0;
	let moved = 0;

	for (const increment of increments) {
		if (increment.node.start >= region.start && increment.node.end <= region.end) {
			removed += increment.points;

			moved += increment.nested ? increment.points - region.depth : increment.points;
		}
	}

	return option(region, total - removed, moved);
}

/** Orders options best first: the lowest score, then the earliest, then the shortest region. */
function compare(a: Option, b: Option): number {
	const length = (option: Option) => option.region.end - option.region.start;

	return a.score - b.score || a.region.start - b.region.start || length(a) - length(b);
}

/**
 * The best run of consecutive statements in the unit's body, short of the whole body.
 * Runs sit at depth 0, so a run's score is just the points of its statements, summed
 * from a running total rather than by rescanning the increments for every run.
 */
function bestRun(unit: FunctionUnit, increments: readonly Increment[], total: number): Option[] {
	const statements = unit.body?.type === "BlockStatement" ? unit.body.body : [];
	const before = [0];

	for (const statement of statements) {
		const inside = increments.filter(
			({ node }) => node.start >= statement.start && node.end <= statement.end,
		);

		before.push(before.at(-1)! + inside.reduce((sum, { points }) => sum + points, 0));
	}

	let best: Option | undefined;

	for (let from = 0; from < statements.length; from++) {
		for (let to = from; to < statements.length && to - from + 1 < statements.length; to++) {
			const removed = before[to + 1]! - before[from]!;
			const score = Math.max(total - removed, removed);

			if (!best || score < best.score) {
				const [region] = statementsRegion(statements.slice(from, to + 1), 0);

				best = option(region!, total - removed, removed);
			}
		}
	}

	return best ? [best] : [];
}

/** The hint when no region helps, worded by the heaviest contributor. */
function fallbackText({ kind, line }: Contributor): string {
	if (kind === "&&") {
		return `split the condition at line ${line} into named helper functions`;
	}

	if (kind === "else if") {
		return `replace the else-if chain at line ${line} with a switch or a lookup table`;
	}

	return `split the code around line ${line} into smaller functions`;
}

/**
 * One concrete change: move the region that best splits the score, so that both
 * functions end up lower than this one is now. See "Fix" in docs/specs/diagnostics.md.
 */
export function suggestFix(
	unit: FunctionUnit,
	increments: readonly Increment[],
	total: number,
	heaviest: Contributor,
): string {
	const options = [
		...increments
			.flatMap((increment) => regionsOf(increment, increments))
			.map((region) => evaluate(region, increments, total)),
		...bestRun(unit, increments, total),
	];

	const [best] = options.filter((candidate) => candidate.score < total).sort(compare);

	return best ? best.region.text(best.remaining, best.moved) : fallbackText(heaviest);
}

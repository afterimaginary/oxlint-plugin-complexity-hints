import type { ESTree, ScopeManager } from "@oxlint/plugins";
import { kindText, type Contributor } from "./contributors.ts";
import { findGuardClause, type GuardClause } from "./guard-clause.ts";
import { obstaclesOf, unitScopes, type RegionShape, type UnitScopes } from "./obstacles.ts";
import { enclosingUnit, isElseIf, type FunctionUnit, type Increment } from "./scoring.ts";

/** A stretch of a unit that could move into a new function. */
interface Region extends RegionShape {
	firstLine: number;
	lastLine: number;
	/** The fix's wording, given what each function would then score and any obstacle clauses. */
	text: (remaining: number, moved: number, clauses: readonly string[]) => string;
}

function span(first: ESTree.Node, last: ESTree.Node) {
	return {
		start: first.start,
		end: last.end,
		firstLine: first.loc.start.line,
		lastLine: last.loc.end.line,
	};
}

/** `line N`, or `lines N-M`: how the message words a run of lines. */
export function lines(firstLine: number, lastLine: number): string {
	return firstLine === lastLine ? `line ${firstLine}` : `lines ${firstLine}-${lastLine}`;
}

/** `; it returns …, and it awaits, so …` between the region and the scores. */
function obstacleText(clauses: readonly string[]): string {
	return clauses.length > 0 ? `; ${clauses.join(", and ")}` : "";
}

interface Placement {
	depth: number;
	what?: string;
	owner?: ESTree.Node;
	disposesEarly?: boolean;
}

/** `move lines 5-8 (what) into a new function; …` for a region of whole statements. */
function statementsRegion(
	statements: readonly ESTree.Node[],
	{ depth, what, owner, disposesEarly = false }: Placement,
): Region[] {
	if (statements.length === 0) {
		return [];
	}

	const where = span(statements[0]!, statements.at(-1)!);
	const described = what ? ` (${what})` : "";

	return [
		{
			...where,
			nodes: statements,
			depth,
			owner,
			disposesEarly,
			ternary: false,
			text: (remaining, moved, clauses) =>
				`move ${lines(where.firstLine, where.lastLine)}${described} into a new function${obstacleText(clauses)}; this one drops to ${remaining} and the new one scores ${moved}`,
		},
	];
}

/** The statements of a body, which moves as a whole; a jump to `owner` becomes `return`. */
function bodyRegion(body: ESTree.Node | null, what: string, owner?: ESTree.Node): Region[] {
	if (!body) {
		return [];
	}

	const statements = body.type === "BlockStatement" ? body.body : [body];

	return statementsRegion(statements, { depth: enclosingUnit(body)?.nesting ?? 0, what, owner });
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

		// A `using` in a case lives until the whole `switch` ends, not just the case.
		return statementsRegion(statements, {
			depth: enclosingUnit(switchCase)?.nesting ?? 0,
			what: `the ${label} at line ${switchCase.loc.start.line}`,
			owner: node,
			disposesEarly: true,
		});
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
			nodes: [node],
			depth,
			disposesEarly: false,
			ternary: true,
			text: (remaining, moved, clauses) =>
				`move the '?:' at ${where}, into a helper function${obstacleText(clauses)}; this one drops to ${remaining} and the helper scores ${moved}`,
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
			return bodyRegion(node.body, `the body of the ${kindText(kind)} at ${at}`, node);

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
	/** What the move has to work around, one clause each. */
	clauses: readonly string[];
}

/**
 * What each function would score once `region` moved out and its obstacles were
 * worked around, or `undefined` when there is no standard way around them.
 */
function evaluate(
	region: Region,
	increments: readonly Increment[],
	total: number,
	scopes: UnitScopes,
): Option | undefined {
	const obstacles = obstaclesOf(region, scopes);

	if (!obstacles) {
		return undefined;
	}

	let removed = 0;
	let moved = -obstacles.movedDelta;

	for (const increment of increments) {
		if (increment.node.start >= region.start && increment.node.end <= region.end) {
			removed += increment.points;

			moved += increment.nested ? increment.points - region.depth : increment.points;
		}
	}

	const remaining = total - removed + obstacles.cost;

	return {
		region,
		remaining,
		moved,
		score: Math.max(remaining, moved),
		clauses: obstacles.clauses,
	};
}

/** Orders options best first: the lowest score, fewest obstacles, earliest, then shortest. */
function compare(a: Option, b: Option): number {
	const length = (option: Option) => option.region.end - option.region.start;

	return (
		a.score - b.score ||
		a.clauses.length - b.clauses.length ||
		a.region.start - b.region.start ||
		length(a) - length(b)
	);
}

/** How many statement runs get their obstacles analysed, at most, per score. */
const RUNS_ANALYSED = 64;

/** Running totals of the points in `statements`: `before[i]` is the sum before statement `i`. */
function runningTotals(statements: readonly ESTree.Node[], increments: readonly Increment[]) {
	const before = [0];

	for (const statement of statements) {
		const inside = increments.filter(
			({ node }) => node.start >= statement.start && node.end <= statement.end,
		);

		before.push(before.at(-1)! + inside.reduce((sum, { points }) => sum + points, 0));
	}

	return before;
}

/**
 * Every run of consecutive statements, short of the whole body, as `[from, to]`, shortest
 * first, since a short run is likelier to have nothing in its way.
 */
function* runsOf(count: number): Generator<[number, number]> {
	for (let length = 1; length < count; length++) {
		for (let from = 0; from + length <= count; from++) {
			yield [from, from + length - 1];
		}
	}
}

/**
 * The runs worth analysing: of those at the lowest score before obstacles, and of those
 * one above it, the first `RUNS_ANALYSED` each, shortest first. A run's score before
 * obstacles is just its points, from running totals.
 */
function cheapestRuns(
	statements: readonly ESTree.Node[],
	increments: readonly Increment[],
	total: number,
): [number, number][] {
	const before = runningTotals(statements, increments);
	let lowest = Infinity;
	// The runs at `lowest`, then at `lowest + 1`.
	let found: [number, number][][] = [[], []];

	for (const run of runsOf(statements.length)) {
		const removed = before[run[1] + 1]! - before[run[0]]!;
		const score = Math.max(total - removed, removed);

		if (score < lowest) {
			found = score === lowest - 1 ? [[], found[0]!] : [[], []];

			lowest = score;
		}

		const runs = found[score - lowest];

		if (runs && runs.length < RUNS_ANALYSED) {
			runs.push(run);
		}
	}

	return found.flat();
}

/**
 * Runs of consecutive statements in the unit's body. Obstacles can only add one point
 * (an `if` at depth 0), so only runs at the lowest score or one above can win. See
 * "Statement runs" in the spec.
 */
function runOptions(
	unit: FunctionUnit,
	increments: readonly Increment[],
	total: number,
	scopes: UnitScopes,
): Option[] {
	const statements = unit.body?.type === "BlockStatement" ? unit.body.body : [];

	return cheapestRuns(statements, increments, total).flatMap(([from, to]) => {
		const [region] = statementsRegion(statements.slice(from, to + 1), {
			depth: 0,
			disposesEarly: to < statements.length - 1,
		});

		return evaluate(region!, increments, total, scopes) ?? [];
	});
}

function guardText(
	{ increment, exit, saving }: GuardClause,
	increments: readonly Increment[],
	total: number,
): string {
	const early = exit === "return" ? "returns early" : "continues to the next iteration early";

	return `invert the 'if' at ${position(increment, increments)} into a guard clause that ${early}, so its body moves up a level; this one drops to ${total - saving}`;
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
 * How a fix is chosen when a guard clause and a move both help. The rule uses "guard if
 * enough" (ADR-0005); the others are kept to be measured against it (see
 * docs/evaluation/strategies.md).
 *
 * - "guard first": the guard.
 * - "largest saving": whichever leaves the lower highest score; a tie goes to the guard,
 *   which moves no code.
 * - "guard if enough": the guard when it brings the function to the max, or else as
 *   "largest saving".
 */
export type Strategy = "guard first" | "largest saving" | "guard if enough";

/** The best region to move, if any leaves both functions lower than this one is now. */
function bestMove(
	unit: FunctionUnit,
	increments: readonly Increment[],
	total: number,
	scopeManager: ScopeManager,
): Option | undefined {
	const scopes = unitScopes(unit, scopeManager);

	const options = [
		...increments
			.flatMap((increment) => regionsOf(increment, increments))
			.flatMap((region) => evaluate(region, increments, total, scopes) ?? []),
		...runOptions(unit, increments, total, scopes),
	];

	return options.filter((candidate) => candidate.score < total).sort(compare)[0];
}

/**
 * One concrete change: a guard clause, or a region to move that best splits the score, so
 * that both functions end up lower than this one is now, saying what stands in the way.
 * When both help, `strategy` picks one. See "Fix" in docs/specs/diagnostics.md.
 */
export function suggestFix(
	unit: FunctionUnit,
	increments: readonly Increment[],
	{ total, max }: { total: number; max: number },
	heaviest: Contributor,
	scopeManager: ScopeManager,
	strategy: Strategy = "guard if enough",
): string {
	const guard = findGuardClause(increments);
	// What this one scores once the guard clause is in.
	const guarded = guard ? total - guard.saving : Infinity;

	if (guard && (strategy === "guard first" || (strategy === "guard if enough" && guarded <= max))) {
		return guardText(guard, increments, total);
	}

	const best = bestMove(unit, increments, total, scopeManager);

	if (guard && !(best && best.score < guarded)) {
		return guardText(guard, increments, total);
	}

	return best ? best.region.text(best.remaining, best.moved, best.clauses) : fallbackText(heaviest);
}

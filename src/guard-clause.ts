import type { ESTree } from "@oxlint/plugins";
import { isFunctionUnit, type Increment } from "./scoring.ts";

/** An `if` that can be inverted into `if (!test) return;` or `if (!test) continue;`. */
export interface GuardClause {
	/** The `if` increment to invert. */
	increment: Increment;
	exit: "return" | "continue";
	/** One point per nesting-scored increment in the `if`'s body, which all move up a level. */
	saving: number;
}

function isLoop(
	node: ESTree.Node,
): node is
	| ESTree.ForStatement
	| ESTree.ForInStatement
	| ESTree.ForOfStatement
	| ESTree.WhileStatement
	| ESTree.DoWhileStatement {
	return (
		node.type === "ForStatement" ||
		node.type === "ForInStatement" ||
		node.type === "ForOfStatement" ||
		node.type === "WhileStatement" ||
		node.type === "DoWhileStatement"
	);
}

/**
 * How an early exit from `statement` would leave, when nothing would be skipped:
 * the `if` has no `else` and is the last statement of its block, and every
 * enclosing block likewise ends at its owner, up to a function body or a loop body.
 */
function exitOf(statement: ESTree.IfStatement): GuardClause["exit"] | undefined {
	if (statement.alternate) {
		return undefined;
	}

	let current: ESTree.Node = statement;

	for (;;) {
		const parent: ESTree.Node = current.parent;

		if (parent.type === "BlockStatement") {
			if (parent.body.at(-1) !== current) {
				return undefined;
			}
		} else if (isFunctionUnit(parent) && parent.body === current) {
			return "return";
		} else if (isLoop(parent) && parent.body === current) {
			return "continue";
		} else if (parent.type !== "IfStatement" || parent.alternate || parent.consequent !== current) {
			// A `switch`, `try`, `else`, label or anything else on the path.
			return undefined;
		}

		current = parent;
	}
}

/** The increment to attack first: deepest nesting, then most points, then earliest line. */
function deepest(increments: readonly Increment[]): Increment | undefined {
	return increments.toSorted(
		(a, b) => b.nesting - a.nesting || b.points - a.points || a.line - b.line,
	)[0];
}

/** One point per increment in the body of `statement` that takes a nesting bonus. */
function saving(statement: ESTree.IfStatement, increments: readonly Increment[]): number {
	const { consequent } = statement;

	return increments.filter(
		({ node, nested }) => nested && node.start >= consequent.start && node.end <= consequent.end,
	).length;
}

/**
 * The guard clause that saves the most around the deepest increment: of the `if`s
 * that hold it, including the increment itself, the outermost one that qualifies,
 * when it saves at least one point.
 * See "Guard clause" in docs/specs/diagnostics.md.
 */
export function findGuardClause(increments: readonly Increment[]): GuardClause | undefined {
	let found: GuardClause | undefined;

	// Every unit's increments sit inside it, so the walk stops at the unit.
	for (
		let node = deepest(increments)?.node;
		node && !isFunctionUnit(node);
		node = node.parent ?? undefined
	) {
		if (node.type !== "IfStatement") {
			continue;
		}

		const statement = node;
		const increment = increments.find((other) => other.node === statement && other.kind === "if");
		const exit = exitOf(statement);

		if (increment && exit) {
			found = { increment, exit, saving: saving(statement, increments) };
		}
	}

	// A guard with nothing beneath it that takes a nesting bonus is no fix.
	return found && found.saving > 0 ? found : undefined;
}

import type { ESTree } from "@oxlint/plugins";

/** A node scored as its own unit: see "Function units" in docs/specs/scoring.md. */
export type FunctionUnit = ESTree.Function | ESTree.ArrowFunctionExpression;

/** The kinds of construct that score: see "What counts" in docs/specs/scoring.md. */
export type Kind =
	| "if"
	| "else if"
	| "else"
	| "?:"
	| "switch"
	| "for"
	| "for...in"
	| "for...of"
	| "for await...of"
	| "while"
	| "do...while"
	| "catch"
	| "&&"
	| "labeled break"
	| "labeled continue";

/** One scored construct in a unit. */
export interface Increment {
	kind: Kind;
	/** The construct's node; its range decides which region the increment moves with. */
	node: ESTree.Node;
	line: number;
	points: number;
	/** Whether this kind of construct takes a nesting bonus, even when the bonus is 0. */
	nested: boolean;
	/** The nesting bonus included in `points`. */
	nesting: number;
}

export function isFunctionUnit(node: ESTree.Node): node is FunctionUnit {
	return (
		node.type === "FunctionDeclaration" ||
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression"
	);
}

/** Is `node` the `if` of an `else if`? */
export function isElseIf(node: ESTree.Node): boolean {
	return (
		node.type === "IfStatement" &&
		node.parent.type === "IfStatement" &&
		node.parent.alternate === node
	);
}

/** Does `child` sit one nesting level deeper than its `parent`? See "Nesting" in the spec. */
function raisesNesting(parent: ESTree.Node, child: ESTree.Node): boolean {
	switch (parent.type) {
		case "IfStatement":
			return child === parent.consequent || (child === parent.alternate && !isElseIf(child));

		case "ConditionalExpression":
			return child === parent.consequent || child === parent.alternate;

		case "SwitchStatement":
			return child.type === "SwitchCase";

		case "CatchClause":
			return child === parent.body;

		case "ForStatement":
		case "ForInStatement":
		case "ForOfStatement":
		case "WhileStatement":
		case "DoWhileStatement":
			return child === parent.body;

		default:
			return false;
	}
}

/** The unit an increment at `node` belongs to, and its nesting level there. */
export function enclosingUnit(node: ESTree.Node): { unit: FunctionUnit; nesting: number } | null {
	let nesting = 0;
	let child = node;

	for (let parent = node.parent; parent; parent = parent.parent) {
		if (isFunctionUnit(parent)) {
			return { unit: parent, nesting };
		}

		if (raisesNesting(parent, child)) {
			nesting += 1;
		}

		child = parent;
	}

	return null;
}

/** Is `node` the outermost logical expression of its chain? */
export function isChainRoot(node: ESTree.LogicalExpression): boolean {
	return node.parent.type !== "LogicalExpression";
}

/**
 * Is the chain rooted at `root` conditional rendering, like `{a && <El />}`? That
 * is a chain directly inside a JSX expression container that uses one operator
 * throughout and has no ternary operand.
 */
export function isJsxShortCircuit(root: ESTree.LogicalExpression): boolean {
	const uniform = (node: ESTree.Node): boolean => {
		if (node.type === "ConditionalExpression") {
			return false;
		}

		if (node.type !== "LogicalExpression") {
			return true;
		}

		return node.operator === root.operator && uniform(node.left) && uniform(node.right);
	};

	return root.parent.type === "JSXExpressionContainer" && uniform(root);
}

/** The number of runs of consecutive `&&` in the chain rooted at `root`. */
export function andRuns(root: ESTree.LogicalExpression): number {
	let runs = 0;
	let previous: string | undefined;

	// Operators in source order: left subtree, own operator, right subtree.
	const walk = (node: ESTree.Node): void => {
		if (node.type !== "LogicalExpression") {
			return;
		}

		walk(node.left);

		if (node.operator === "&&" && previous !== "&&") {
			runs += 1;
		}

		previous = node.operator;

		walk(node.right);
	};

	walk(root);

	return runs;
}

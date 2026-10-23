import type { ESTree } from "@oxlint/plugins";

/** A node scored as its own unit: see "Function units" in docs/specs/scoring.md. */
export type FunctionUnit = ESTree.Function | ESTree.ArrowFunctionExpression;

export function isFunctionUnit(node: ESTree.Node): node is FunctionUnit {
	return (
		node.type === "FunctionDeclaration" ||
		node.type === "FunctionExpression" ||
		node.type === "ArrowFunctionExpression"
	);
}

export const LOOP_TYPES = new Set([
	"ForStatement",
	"ForInStatement",
	"ForOfStatement",
	"WhileStatement",
	"DoWhileStatement",
]);

/** Does `child` sit one nesting level deeper than its `parent`? See "Nesting" in the spec. */
function raisesNesting(parent: ESTree.Node, child: ESTree.Node): boolean {
	switch (parent.type) {
		case "IfStatement":
			return (
				child === parent.consequent || (child === parent.alternate && child.type !== "IfStatement")
			);

		case "ConditionalExpression":
			return child === parent.consequent || child === parent.alternate;

		case "SwitchStatement":
			return child.type === "SwitchCase";

		case "CatchClause":
			return child === parent.body;

		default:
			return LOOP_TYPES.has(parent.type) && "body" in parent && child === parent.body;
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

import type { ESTree, Rule, Visitor } from "@oxlint/plugins";
import { reportLocation } from "../report-location.ts";
import {
	andRuns,
	enclosingUnit,
	isChainRoot,
	isElseIf,
	isJsxShortCircuit,
	type FunctionUnit,
} from "../scoring.ts";

const DEFAULT_MAX = 15;

/** Accepts `{ max: n }` or a bare `n`; the schema has already validated the shape. */
function readMax(options: readonly unknown[]): number {
	const [option] = options;

	if (typeof option === "number") {
		return option;
	}

	if (typeof option === "object" && option !== null && "max" in option) {
		return option.max as number;
	}

	return DEFAULT_MAX;
}

const rule: Rule = {
	meta: {
		type: "suggestion",
		docs: {
			description: "Limit the cognitive complexity of each function",
		},
		messages: {
			tooComplex: "Cognitive complexity of this function is {{total}}, over the max of {{max}}.",
		},
		schema: [
			{
				anyOf: [
					{ type: "integer", minimum: 0 },
					{
						type: "object",
						properties: { max: { type: "integer", minimum: 0 } },
						additionalProperties: false,
					},
				],
			},
		],
	},
	createOnce(context) {
		let scores = new Map<FunctionUnit, number>();
		let max = DEFAULT_MAX;

		/** Adds `points` to the unit `node` belongs to, plus the nesting level when `nested`. */
		function record(node: ESTree.Node, points: number, nested: boolean): void {
			const found = enclosingUnit(node);

			// Code outside every function unit is not scored.
			if (found) {
				const increment = nested ? points + found.nesting : points;

				scores.set(found.unit, scores.get(found.unit)! + increment);
			}
		}

		/** +1 plus the nesting level: `if`, ternaries, `switch`, loops, `catch`. */
		function addNested(node: ESTree.Node): void {
			record(node, 1, true);
		}

		/** A fixed number of points: `else if`, `else`, `&&` runs, labeled jumps. */
		function addFlat(node: ESTree.Node, points = 1): void {
			record(node, points, false);
		}

		function enterUnit(unit: FunctionUnit): void {
			scores.set(unit, 0);
		}

		function exitUnit(unit: FunctionUnit): void {
			const total = scores.get(unit)!;

			if (total > max) {
				context.report({
					messageId: "tooComplex",
					data: { total, max },
					loc: reportLocation(unit, context.sourceCode),
				});
			}
		}

		const visitor: Visitor = {
			before() {
				scores = new Map();

				max = readMax(context.options);
			},
			FunctionDeclaration: enterUnit,
			FunctionExpression: enterUnit,
			ArrowFunctionExpression: enterUnit,
			"FunctionDeclaration:exit": exitUnit,
			"FunctionExpression:exit": exitUnit,
			"ArrowFunctionExpression:exit": exitUnit,
			IfStatement(node) {
				if (isElseIf(node)) {
					addFlat(node);
				} else {
					addNested(node);
				}

				if (node.alternate && !isElseIf(node.alternate)) {
					addFlat(node.alternate);
				}
			},
			ConditionalExpression: addNested,
			SwitchStatement: addNested,
			ForStatement: addNested,
			ForInStatement: addNested,
			ForOfStatement: addNested,
			WhileStatement: addNested,
			DoWhileStatement: addNested,
			CatchClause: addNested,
			LogicalExpression(node) {
				if (isChainRoot(node) && !isJsxShortCircuit(node)) {
					const runs = andRuns(node);

					if (runs > 0) {
						addFlat(node, runs);
					}
				}
			},
			BreakStatement(node) {
				if (node.label) {
					addFlat(node);
				}
			},
			ContinueStatement(node) {
				if (node.label) {
					addFlat(node);
				}
			},
		};

		return visitor;
	},
};

export default rule;

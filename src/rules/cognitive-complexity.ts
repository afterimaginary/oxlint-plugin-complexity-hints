import type { ESTree, Rule, Visitor } from "@oxlint/plugins";
import { reportLocation } from "../report-location.ts";
import { andRuns, enclosingUnit, isChainRoot, LOOP_TYPES, type FunctionUnit } from "../scoring.ts";

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

		/** Adds an increment at `node`: +1 when `flat`, otherwise +1 plus its nesting level. */
		function add(node: ESTree.Node, flat = false, points = 1): void {
			const found = enclosingUnit(node);

			if (!found) {
				return;
			}

			const increment = flat ? points : points + found.nesting;

			scores.set(found.unit, (scores.get(found.unit) ?? 0) + increment);
		}

		function enterUnit(unit: FunctionUnit): void {
			scores.set(unit, 0);
		}

		function exitUnit(unit: FunctionUnit): void {
			const total = scores.get(unit) ?? 0;

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
				const isElseIf = node.parent.type === "IfStatement" && node.parent.alternate === node;

				add(node, isElseIf);

				if (node.alternate && node.alternate.type !== "IfStatement") {
					// An `else` sits at its `if`'s level, so nesting is irrelevant to it.
					add(node, true);
				}
			},
			ConditionalExpression: (node) => add(node),
			SwitchStatement: (node) => add(node),
			CatchClause: (node) => add(node),
			LogicalExpression(node) {
				if (isChainRoot(node)) {
					const runs = andRuns(node);

					if (runs > 0) {
						add(node, true, runs);
					}
				}
			},
			BreakStatement(node) {
				if (node.label) {
					add(node, true);
				}
			},
			ContinueStatement(node) {
				if (node.label) {
					add(node, true);
				}
			},
		};

		for (const type of LOOP_TYPES) {
			visitor[type as keyof Visitor] = (node: ESTree.Node) => add(node);
		}

		return visitor;
	},
};

export default rule;

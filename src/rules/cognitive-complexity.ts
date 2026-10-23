import type { ESTree, Rule, Visitor } from "@oxlint/plugins";
import { describeContributors, rankContributors } from "../contributors.ts";
import { describeFunction } from "../describe-function.ts";
import { suggestFix } from "../hint.ts";
import { reportLocation } from "../report-location.ts";
import {
	andRuns,
	enclosingUnit,
	isChainRoot,
	isElseIf,
	isJsxShortCircuit,
	type FunctionUnit,
	type Increment,
	type Kind,
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
			// One line: see docs/specs/diagnostics.md.
			tooComplex:
				"{{label}} has cognitive complexity {{total}}, over the max of {{max}}; main contributors: {{contributors}}; fix: {{fix}}.",
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
		let increments = new Map<FunctionUnit, Increment[]>();
		let max = DEFAULT_MAX;

		/** Records an increment for the unit `node` belongs to, plus the nesting level when `nested`. */
		function record(
			node: ESTree.Node,
			kind: Kind,
			{ points = 1, nested = false, line = node.loc.start.line } = {},
		): void {
			const found = enclosingUnit(node);

			// Code outside every function unit is not scored.
			if (found) {
				const nesting = nested ? found.nesting : 0;

				increments.get(found.unit)!.push({
					kind,
					node,
					line,
					points: points + nesting,
					nested,
					nesting,
				});
			}
		}

		/** +1 plus the nesting level: `if`, ternaries, `switch`, loops, `catch`. */
		function addNested(kind: Kind) {
			return (node: ESTree.Node) => record(node, kind, { nested: true });
		}

		function enterUnit(unit: FunctionUnit): void {
			increments.set(unit, []);
		}

		function exitUnit(unit: FunctionUnit): void {
			const scored = increments.get(unit)!;
			const total = scored.reduce((sum, increment) => sum + increment.points, 0);

			if (total > max) {
				const ranked = rankContributors(scored);

				context.report({
					messageId: "tooComplex",
					data: {
						label: describeFunction(unit),
						total,
						max,
						contributors: describeContributors(ranked),
						fix: suggestFix(unit, scored, total, ranked[0]!),
					},
					loc: reportLocation(unit, context.sourceCode),
				});
			}
		}

		const visitor: Visitor = {
			before() {
				increments = new Map();

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
					record(node, "else if");
				} else {
					record(node, "if", { nested: true });
				}

				if (node.alternate && !isElseIf(node.alternate)) {
					// Kept on the `if`, so moving the `else` body leaves this increment behind.
					const keyword = context.sourceCode.getTokenBefore(node.alternate);

					record(node, "else", { line: keyword?.loc.start.line });
				}
			},
			ConditionalExpression: addNested("?:"),
			SwitchStatement: addNested("switch"),
			ForStatement: addNested("for"),
			ForInStatement: addNested("for...in"),
			ForOfStatement(node) {
				record(node, node.await ? "for await...of" : "for...of", { nested: true });
			},
			WhileStatement: addNested("while"),
			DoWhileStatement: addNested("do...while"),
			CatchClause: addNested("catch"),
			LogicalExpression(node) {
				if (isChainRoot(node) && !isJsxShortCircuit(node)) {
					const runs = andRuns(node);

					if (runs > 0) {
						record(node, "&&", { points: runs });
					}
				}
			},
			BreakStatement(node) {
				if (node.label) {
					record(node, "labeled break");
				}
			},
			ContinueStatement(node) {
				if (node.label) {
					record(node, "labeled continue");
				}
			},
		};

		return visitor;
	},
};

export default rule;

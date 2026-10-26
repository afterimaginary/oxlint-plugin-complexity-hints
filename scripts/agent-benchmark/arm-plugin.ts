// The plugin each arm of the agent benchmark lints with, bundled once per arm by
// scripts/agent-benchmark/prepare.mjs. Every arm registers the same rule id, so only the
// message tells them apart.
import type { CreateOnceRule, Diagnostic, Plugin, Rule } from "@oxlint/plugins";
import type { Strategy } from "../../src/hint.ts";
import { createRule } from "../../src/rules/cognitive-complexity.ts";

/** The arms, in the order the protocol names them. */
export const ARMS = [
	{ arm: "A", title: "Bare score" },
	{ arm: "B", title: "Hint, guard first", strategy: "guard first" },
	{ arm: "C", title: "Hint, guard if enough", strategy: "guard if enough" },
] as const satisfies { arm: string; title: string; strategy?: Strategy }[];

/**
 * The rule with SonarJS S3776's message in place of this rule's: the score and the max,
 * and nothing about where the score comes from or how to lower it.
 */
function bare(): Rule {
	const rule = createRule() as CreateOnceRule;

	return {
		...rule,
		createOnce(context) {
			const report = (descriptor: Diagnostic): void => {
				const { total, max } = descriptor.data!;

				context.report({
					message: `Refactor this function to reduce its Cognitive Complexity from ${total} to the ${max} allowed.`,
					loc: descriptor.loc!,
				});
			};

			// The context's own `report` can't be replaced, so the rule gets one that inherits the rest.
			const wrapped = Object.create(context, { report: { value: report } }) as typeof context;

			return rule.createOnce(wrapped);
		},
	};
}

/** The plugin for `arm`. */
export function armPlugin(arm: (typeof ARMS)[number]["arm"]): Plugin {
	const { strategy } = ARMS.find((entry) => entry.arm === arm)! as { strategy?: Strategy };

	return {
		meta: { name: "complexity" },
		rules: { "cognitive-complexity": strategy ? createRule(strategy) : bare() },
	};
}

import type { Rule } from "@oxlint/plugins";

const rule: Rule = {
	meta: {
		type: "suggestion",
		docs: {
			description: "Limit the cognitive complexity of each function",
		},
		schema: [],
	},
	createOnce() {
		return {};
	},
};

export default rule;

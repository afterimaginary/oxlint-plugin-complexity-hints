import type { Plugin } from "@oxlint/plugins";
import cognitiveComplexity from "./rules/cognitive-complexity.ts";

const plugin: Plugin = {
	meta: { name: "complexity" },
	rules: { "cognitive-complexity": cognitiveComplexity },
};

export default plugin;

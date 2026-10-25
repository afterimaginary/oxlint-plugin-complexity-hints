// The rule once per hint strategy, for scripts/simulate-hints.mjs. Each rule picks fixes the
// way its strategy says (see `Strategy` in src/hint.ts); the shipped plugin uses "guard
// first", which comes first here, as the one the others are compared with.
import type { Plugin } from "@oxlint/plugins";
import type { Strategy } from "../src/hint.ts";
import { createRule } from "../src/rules/cognitive-complexity.ts";

export const STRATEGIES: { strategy: Strategy; rule: string; title: string }[] = [
	{ strategy: "guard first", rule: "guard-first", title: "Guard first" },
	{ strategy: "largest saving", rule: "largest-saving", title: "Largest saving" },
	{ strategy: "guard if enough", rule: "guard-if-enough", title: "Guard if enough" },
];

const plugin: Plugin = {
	meta: { name: "complexity" },
	rules: Object.fromEntries(STRATEGIES.map(({ strategy, rule }) => [rule, createRule(strategy)])),
};

export default plugin;

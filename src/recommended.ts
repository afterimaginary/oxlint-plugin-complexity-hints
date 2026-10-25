import type { OxlintConfig } from "oxlint";

/**
 * The `recommended` preset, for `extends` in `oxlint.config.ts`: this plugin's
 * `cognitive-complexity` at its default max, and Oxlint's `max-params` at 5 (ADR-0003).
 *
 * The build also writes it to `recommended.json` for `.oxlintrc.json`, so this is the one
 * source of both. A JSON import can't stand in for this export: it widens `"error"` to
 * `string`, which `OxlintConfig` rejects.
 */
const recommended = {
	jsPlugins: ["oxlint-plugin-complexity-hints"],
	rules: {
		"complexity/cognitive-complexity": "error",
		"max-params": ["error", { max: 5 }],
	},
} satisfies OxlintConfig;

export default recommended;

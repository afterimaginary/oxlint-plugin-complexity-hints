import { defineConfig } from "vite-plus";

// Single-line declarations that may stay grouped without blank lines.
const declarations = [
	"singleline-const",
	"singleline-let",
	"singleline-var",
	"singleline-type",
	"singleline-export",
];

const ignored = [
	// Synced from claude-config; not edited here.
	".claude/**",
	".github/**",
];

export default defineConfig({
	staged: {
		"*": "vp check --fix",
	},
	pack: {
		deps: { resolveDepSubpath: true },
		dts: {
			generator: "tsgo",
		},
		exports: true,
	},
	fmt: {
		useTabs: true,
		ignorePatterns: ignored,
	},
	lint: {
		ignorePatterns: ignored,
		jsPlugins: [
			{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
			"@stylistic/eslint-plugin",
		],
		rules: {
			// Flags imports that should come from vite-plus. Published source under src/
			// must import @oxlint/plugins so the package works in plain Oxlint (see CLAUDE.md).
			"vite-plus/prefer-vite-plus-imports": "error",
			// Braces on every block, so no one-line `if (x) return y;`.
			curly: ["error", "all"],
			// Blank lines, inserted by `vp lint --fix`; Oxfmt keeps blank lines but never adds
			// them. Every statement stands apart except the groups below. The last matching
			// entry wins, so order matters.
			"@stylistic/padding-line-between-statements": [
				"error",
				{ blankLine: "always", prev: "*", next: "*" },
				{ blankLine: "any", prev: "import", next: "import" },
				{ blankLine: "any", prev: declarations, next: declarations },
				// Stacked `case` labels that fall through to the next one.
				{
					blankLine: "any",
					prev: { selector: "SwitchCase[consequent.length=0]" },
					next: ["case", "default"],
				},
			],
			// Object literals with 4+ keys put each key on its own line; Oxfmt finishes the layout.
			"@stylistic/object-curly-newline": [
				"error",
				{ ObjectExpression: { minProperties: 4, multiline: true, consistent: true } },
			],
		},
		options: { typeAware: true, typeCheck: true },
	},
});

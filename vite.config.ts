import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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
	// Scoring fixtures; formatting or lint fixes would move the lines and columns tests expect.
	"tests/fixtures/**",
];

export default defineConfig({
	staged: {
		"*": "vp check --fix",
	},
	pack: {
		entry: ["src/index.ts", "src/recommended.ts", "src/checker/cli.ts"],
		deps: { resolveDepSubpath: true },
		dts: {
			generator: "tsgo",
		},
		exports: {
			// The checker is a command, not a module to import.
			bin: { "complexity-hints": "./src/checker/cli.ts" },
			customExports(exports) {
				delete exports["./checker/cli"];

				return exports;
			},
		},
		hooks: {
			// The preset for `.oxlintrc.json`, read back from the typed export just built, so a
			// rebuild in watch mode writes the edited preset too.
			"build:done": async ({ options }) => {
				const built = pathToFileURL(join(options.outDir, "recommended.mjs"));
				const { default: preset } = await import(`${built.href}?build=${Date.now()}`);
				const json = `${JSON.stringify(preset, null, "\t")}\n`;

				await writeFile(join(import.meta.dirname, "recommended.json"), json);
			},
		},
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
			// This plugin, from source, so the repository is held to its own rule.
			{ name: "complexity", specifier: "./src/index.ts" },
		],
		rules: {
			"complexity/cognitive-complexity": "error",
			// Flags imports that should come from vite-plus. Turned off for src/ below.
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
		overrides: [
			{
				files: ["src/**"],
				rules: {
					// Published code must work in plain Oxlint, without Vite+ installed, so it
					// imports the plugin API from @oxlint/plugins.
					"vite-plus/prefer-vite-plus-imports": "off",
					// The package ships with no runtime dependencies and no bundled code, so
					// @oxlint/plugins (a devDependency) may only be imported for types, and
					// Vite+, which consumers may not have, not at all.
					"no-restricted-imports": [
						"error",
						{
							paths: [{ name: "@oxlint/plugins", allowTypeImports: true }],
							patterns: [{ regex: "^(vite-plus|@oxlint/plugins/)" }],
						},
					],
					// `import { type X }` still emits `import "..."` under verbatimModuleSyntax.
					"typescript/no-import-type-side-effects": "error",
				},
			},
		],
		options: { typeAware: true, typeCheck: true },
	},
});

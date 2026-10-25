import { extname } from "node:path";
import tsParser from "@typescript-eslint/parser";
import { Linter } from "eslint";
import sonarjs from "eslint-plugin-sonarjs";

const linter = new Linter();

/**
 * Every report eslint-plugin-sonarjs makes at threshold 0, as `line:column=total`. The
 * file name picks script or module and JSX, as it does for this rule.
 */
export function oracle(file: string, code: string): string[] {
	const extension = extname(file);

	const messages = linter.verify(
		code,
		{
			files: ["**/*.{js,cjs,jsx,ts,tsx}"],
			languageOptions: {
				parser: tsParser,
				sourceType: extension === ".cjs" ? "script" : "module",
				parserOptions: { ecmaFeatures: { jsx: extension === ".jsx" || extension === ".tsx" } },
			},
			plugins: { sonarjs },
			rules: { "sonarjs/cognitive-complexity": ["error", 0] },
		},
		file,
	);

	return messages.map((message) => {
		const total = /from (\d+) to/.exec(message.message)?.[1];

		// A parse error or config miss must fail the caller, not shrink the reports to nothing.
		if (message.ruleId !== "sonarjs/cognitive-complexity" || !total) {
			throw new Error(`${file}:${message.line}:${message.column}: ${message.message}`);
		}

		return `${message.line}:${message.column}=${total}`;
	});
}

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vite-plus/test";

const root = join(import.meta.dirname, "..");
const oxlint = join(root, "node_modules/.bin/oxlint");
const work = mkdtempSync(join(tmpdir(), "complexity-plugin-"));

writeFileSync(join(work, "input.ts"), "export const answer = 42;\n");

afterAll(() => {
	rmSync(work, { recursive: true, force: true });
});

/** Runs the real Oxlint CLI with the plugin loaded from source and one plugin rule enabled. */
function lintWithRule(rule: string) {
	// Not named `.oxlintrc.json`, so Oxlint never auto-discovers it.
	const config = join(work, "oxlintrc.json");

	writeFileSync(
		config,
		JSON.stringify({
			jsPlugins: [{ name: "complexity", specifier: join(root, "src/index.ts") }],
			rules: { [rule]: "error" },
		}),
	);

	return spawnSync(oxlint, ["-c", config, join(work, "input.ts")], { encoding: "utf8" });
}

describe("plugin", () => {
	test("registers complexity/cognitive-complexity with Oxlint", () => {
		const result = lintWithRule("complexity/cognitive-complexity");

		expect(result.stderr).toBe("");

		expect(result.status).toBe(0);
	});

	test("Oxlint rejects a rule the plugin does not register", () => {
		const result = lintWithRule("complexity/no-such-rule");

		expect(result.stdout + result.stderr).toContain(
			"Rule 'no-such-rule' not found in plugin 'complexity'",
		);

		expect(result.status).not.toBe(0);
	});
});

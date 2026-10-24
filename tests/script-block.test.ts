import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { scriptBlockStart } from "../src/script-block.ts";

const component = join(import.meta.dirname, "fixtures/cli/embedded/component.vue");

describe("scriptBlockStart", () => {
	// The editor's buffer can differ from the file until it is saved.
	test("falls back to the start of the file when the block no longer matches", () => {
		expect(scriptBlockStart(component, "\nfunction unsaved() {}\n")).toEqual({
			lines: 0,
			columns: 0,
		});
	});

	// An unsaved buffer with its first lines deleted is still found further down the file.
	test("leaves files that Oxlint lints whole at the start of the file", () => {
		const script = join(import.meta.dirname, "fixtures/cli/fixes.js");
		const laterLines = readFileSync(script, "utf8").split("\n").slice(5).join("\n");

		expect(scriptBlockStart(script, laterLines)).toEqual({ lines: 0, columns: 0 });
	});

	test("falls back to the start of the file when the file can't be read", () => {
		expect(scriptBlockStart(join(import.meta.dirname, "missing.vue"), "x")).toEqual({
			lines: 0,
			columns: 0,
		});
	});
});

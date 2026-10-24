import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { scriptBlockStart } from "../src/script-block.ts";

const component = join(import.meta.dirname, "fixtures/cli/embedded/component.vue");

describe("scriptBlockStart", () => {
	test("counts lines with Windows line endings, and columns before the block", () => {
		const work = mkdtempSync(join(tmpdir(), "complexity-plugin-"));
		const file = join(work, "crlf.vue");

		try {
			writeFileSync(file, "<template></template>\r\n<script>const a = 1;\r\nf(a);</script>\r\n");

			expect(scriptBlockStart(file, "const a = 1;\r\nf(a);")).toEqual({ lines: 1, columns: 8 });
		} finally {
			rmSync(work, { recursive: true, force: true });
		}
	});

	// The editor's buffer can differ from the file until it is saved.
	test("falls back to the start of the file when the block no longer matches", () => {
		expect(scriptBlockStart(component, "\nfunction unsaved() {}\n")).toEqual({
			lines: 0,
			columns: 0,
		});
	});

	// Text from further down a `.js` file is found there, as an unsaved buffer with its first
	// lines deleted would be, but only embedded scripts are offset.
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

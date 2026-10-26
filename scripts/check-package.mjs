// Fails when the published package would hold anything other than the files below.
// Run after `vp pack`, by the `verify` script.
import { execFileSync } from "node:child_process";

const expected = [
	"LICENSE",
	"README.md",
	"dist/checker/cli.d.mts",
	"dist/checker/cli.mjs",
	"dist/index.d.mts",
	"dist/index.mjs",
	"dist/recommended.d.mts",
	"dist/recommended.mjs",
	"package.json",
	"recommended.json",
];

// `--ignore-scripts`: `prepare` would print ahead of the JSON.
const output = execFileSync("pnpm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
	encoding: "utf8",
});

const packed = JSON.parse(output)
	.files.map(({ path }) => path)
	.sort();

const missing = expected.filter((path) => !packed.includes(path));
const extra = packed.filter((path) => !expected.includes(path));

if (missing.length > 0 || extra.length > 0) {
	console.error(
		`Package contents changed.\nMissing: ${missing.join(", ") || "none"}\nExtra: ${extra.join(", ") || "none"}`,
	);

	process.exit(1);
}

console.log(`Package holds the ${packed.length} expected files.`);

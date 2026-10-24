// Loads the built package with plain `node`, no Vite+ or Oxlint, and checks that the
// plugin registers its rule and that both forms of the preset agree. CI runs it on the
// oldest Node that `engines.node` allows.
import { deepStrictEqual, equal, ok } from "node:assert/strict";
import { readFile } from "node:fs/promises";

const { default: plugin } = await import("../dist/index.mjs");
const { default: recommended } = await import("../dist/recommended.mjs");

equal(plugin.meta.name, "complexity");

ok(plugin.rules["cognitive-complexity"]?.createOnce, "cognitive-complexity is registered");

const json = JSON.parse(await readFile(new URL("../recommended.json", import.meta.url), "utf8"));

deepStrictEqual(recommended, json);

console.log(`Built package loads on Node ${process.versions.node}.`);

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reports, rule, tester } from "./helpers.ts";

/**
 * Every report expected in each fixture at `max: 0`, as `line:column=total`. Units
 * scoring 0 are never reported, so each fixture has scored siblings to show its units
 * are seen. Derived from docs/specs/scoring.md; the comments in each fixture show the
 * increments.
 */
const expected: Record<string, string[]> = {
	"whitepaper.js": [
		"11:10=1", // getWords
		"24:10=7", // sumOfPrimes
		"37:10=9", // myMethod
		"54:15=1", // the arrow in myMethod2; myMethod2 itself scores 0
		"62:10=19", // overriddenSymbolFrom
		"89:10=19", // toRegexp
		"124:2=1", // model.save
		"131:33=3", // the _validate callback
		"136:59=7", // the sync callback
	],
	"conditionals.js": [
		"1:10=1",
		"5:10=2",
		"9:10=4",
		"16:10=3",
		"22:10=4",
		"28:10=4",
		"35:10=3",
		"39:10=10",
		"49:10=1",
		"53:10=3",
		"57:10=6",
		"61:10=2",
		"65:10=2",
		"69:10=3",
		"75:10=1",
		"86:10=3",
		"93:10=3",
		"100:10=2",
		"107:10=3",
	],
	"loops.js": [
		"1:10=1",
		"5:10=1",
		"9:10=1",
		"13:16=1",
		"17:10=1",
		"21:10=1",
		"25:10=6",
		"33:10=3",
		"39:10=2",
		"43:10=5",
		"49:10=1",
		"59:10=3",
		"67:10=3",
		"75:10=2",
		"81:10=1",
	],
	"logical.js": [
		"1:10=1",
		"5:10=1",
		"9:10=2",
		"13:10=1",
		"17:10=1",
		"21:10=2",
		"25:10=2",
		"29:10=4",
		"35:10=1",
		"39:10=2",
		"45:10=2",
	],
	"jumps.js": ["1:10=7", "11:10=4", "19:10=2", "27:10=3"],
	"not-counted.js": ["4:10=1"],
	"units.js": [
		"3:10=1", // declaration: its name
		"5:20=1", // function expression: `function`
		"7:25=1", // named function expression: `function`, not its name
		"9:19=1", // arrow: `=>`
		"11:30=1",
		"13:26=1",
		"15:15=1",
		"17:2=1", // IIFE
		"19:11=1", // generator: its name
		"22:2=1", // constructor
		"23:2=1",
		"24:9=1",
		"25:6=1", // getter: its key
		"26:6=1",
		"27:3=1", // computed key: the key expression
		"28:2=1", // private method
		"29:19=1", // class-field arrow: `=>`
		"30:18=1", // class-field function: `function`
		"34:2=1", // object method: its key
		"35:2=1", // `key: function`: the key
		"36:2=1", // `key: function name`: the key, not the name
		"37:21=1", // `key: () =>`: `=>`
		"38:6=1",
		"41:10=1", // outer, without the returned arrow's `if`
		"43:13=1", // the returned arrow
		"48:10=1", // closureInBranch, without the callback's `if`
		"50:21=1", // the callback, at nesting 0
	],
	"non-units.ts": [
		"21:10=1", // the overload implementation; signatures are not units
		"27:10=2", // classInFunction: its class static block and field
		"37:16=1", // export default function: `function`
		"39:87=1", // the arrow's own `=>`, after the ones in its signature
	],
	// Intentional differences from eslint-plugin-sonarjs, which reports 3 and 6 here (ADR-0002).
	"branch-position.js": ["5:10=2", "11:10=3"],
	// Intentional difference from eslint-plugin-sonarjs, which reports 3 (ADR-0002).
	"branch-position-sloppy.cjs": ["5:10=2"],
};

const fixtures = join(import.meta.dirname, "fixtures");

tester.run("cognitive-complexity fixtures", rule, {
	valid: [],
	invalid: Object.entries(expected).map(([file, entries]) => ({
		name: file,
		filename: file,
		code: readFileSync(join(fixtures, file), "utf8"),
		options: [0],
		errors: reports(entries),
	})),
});

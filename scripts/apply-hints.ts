// Applies a diagnostic's fix hint to a copy of its source, the way the hint says, so the
// copy can be linted again and the scores compared with the promised ones. Used by
// `scripts/evaluate-hints.mjs` on real code, and by `tests/hint-promises.test.ts` on the
// CLI fixtures. The wording it reads is specified in docs/specs/diagnostics.md.
//
// A moved region becomes a function declared at the end of the reported function's body.
// The rule scores every function on its own, so both scores read straight off a lint
// run. The function's own variables stay in scope without parameters; names declared in
// blocks around the region, such as a loop variable, don't, which changes what the code
// does but neither score nor whether the file parses.
import { Buffer } from "node:buffer";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, normalize } from "node:path";
import { parse } from "@typescript-eslint/parser";

/** The parts of an ESTree node the rewrites read. */
interface Node {
	type: string;
	range: [number, number];
	loc: { start: { line: number; column: number }; end: { line: number; column: number } };
	parent?: Node;
	[key: string]: unknown;
}

/** A diagnostic from Oxlint's JSON report. */
export interface Diagnostic {
	code: string;
	filename: string;
	message: string;
	labels: { span: { offset: number; line: number; column: number } }[];
}

/** The kinds of fix hint that promise a score; the fallback promises none. */
type FixKind = "guard" | "move" | "helper";

/** The scores a hint promises: the function's, and a move's new function's. */
interface Promised {
	remaining: number;
	moved?: number;
}

/**
 * A file's text with a hint applied, or why it couldn't be. `lines` counts the lines the change moves: into a new function, or up a level out of a
 * guard clause's body.
 */
type Change = { text: string; lines: number } | { outcome: string };

const NOT_FOUND = { outcome: "not found" };

/** A hint applied to its file, or why it couldn't be. */
type Rewrite = { kind: FixKind; before: number; promised: Promised } & Change;

interface Checked {
	after?: number;
	moved?: number;
	outcome: string;
}

export const RULE = "complexity(cognitive-complexity)";

/** The name the rewrite gives a moved region's new function, unless told another. */
const MOVED = "__hintEvalMoved";

const GUARD =
	/fix: invert the 'if' at line (\d+)(?:, column (\d+))? into a guard clause that (returns|continues)[^;]*; this one drops to (\d+)\.$/;

const MOVE =
	/fix: move (?:lines (\d+)-(\d+)|line (\d+))(?: \(([^)]+)\))? into a new function(.*?); this one drops to (\d+) and the new one scores (\d+)\.$/;

const HELPER =
	/fix: move the '\?:' at line (\d+), column (\d+), into a helper function(.*?); this one drops to (\d+) and the helper scores (\d+)\.$/;

export function kindOf(message: string): FixKind | "fallback" {
	if (GUARD.test(message)) {
		return "guard";
	}

	if (HELPER.test(message)) {
		return "helper";
	}

	return MOVE.test(message) ? "move" : "fallback";
}

export const scoreOf = (message: string): number =>
	Number(/has cognitive complexity (\d+)/.exec(message)![1]);

/** Does a move hint name an obstacle and its workaround? */
export const hasObstacle = (message: string): boolean => /into a new function; it /.test(message);

// Syntax trees ---------------------------------------------------------------------

const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

const LOOPS = new Set([
	"ForStatement",
	"ForInStatement",
	"ForOfStatement",
	"WhileStatement",
	"DoWhileStatement",
]);

/** Statement lists, where a statement can go in or out without braces. */
const LISTS = new Set(["Program", "BlockStatement", "SwitchCase", "StaticBlock"]);

function isNode(value: unknown): value is Node {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as Node).type === "string" &&
		Array.isArray((value as Node).range)
	);
}

function childrenOf(node: Node): Node[] {
	return Object.entries(node)
		.filter(([key]) => key !== "parent")
		.flatMap(([, value]) => value)
		.filter(isNode);
}

/** `source` parsed, with every node linked to its parent. */
function parseFile(source: string, file: string): Node {
	const ast = parse(source, {
		range: true,
		loc: true,
		sourceType: "module",
		jsx: file.endsWith("x"),
	}) as unknown as Node;

	const link = (node: Node): void => {
		for (const child of childrenOf(node)) {
			child.parent = node;

			link(child);
		}
	};

	link(ast);

	return ast;
}

function* nodesOf(node: Node): Generator<Node> {
	yield node;

	for (const child of childrenOf(node)) {
		yield* nodesOf(child);
	}
}

function ancestorsOf(node: Node): Node[] {
	const ancestors = [];

	for (let up = node.parent; up; up = up.parent) {
		ancestors.unshift(up);
	}

	return ancestors;
}

const within = (outer: readonly number[], inner: readonly number[]): boolean =>
	outer[0]! <= inner[0]! && inner[1]! <= outer[1]!;

const enclosingFunction = (node: Node): Node | undefined =>
	ancestorsOf(node).findLast(({ type }) => FUNCTIONS.has(type));

/**
 * Is `unit` the function the diagnostic reports? Its report sits between the start of
 * the function, or of the method or property it is the value of, and its body.
 */
function isReported(unit: Node, offset: number): boolean {
	const owner = unit.parent && unit.parent["value"] === unit ? unit.parent : unit;

	return owner.range[0] <= offset && offset <= (unit["body"] as Node).range[0];
}

interface Edit {
	start: number;
	end: number;
	text: string;
}

/** `text` with `edits` made; an insertion lands before a replacement at the same place. */
function applyEdits(text: string, edits: readonly Edit[], base = 0): string {
	const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);

	return ordered.reduce(
		(result, { start, end, text: replacement }) =>
			result.slice(0, start - base) + replacement + result.slice(end - base),
		text,
	);
}

// Guard clauses ----------------------------------------------------------------------

/** How an early exit from the innermost function or loop around `node` leaves. */
function exitOf(node: Node): string {
	const owner = ancestorsOf(node).findLast(({ type }) => FUNCTIONS.has(type) || LOOPS.has(type));

	return owner && LOOPS.has(owner.type) ? "continues" : "returns";
}

/**
 * The `if` turned into a guard clause. Where it isn't in a block, such as the body of a
 * loop without braces, the guard and the body get braces, so the body stays where it was.
 */
function invert(source: string, statement: Node, exit: string): string {
	const test = statement["test"] as Node;
	const consequent = statement["consequent"] as Node;
	const [start, end] = consequent.range;

	const body =
		consequent.type === "BlockStatement"
			? source.slice(start + 1, end - 1)
			: source.slice(start, end);

	const guard = `if (!(${source.slice(...test.range)})) ${exit === "returns" ? "return" : "continue"};\n${body}`;
	const braced = statement.parent!.type === "BlockStatement" ? guard : `{\n${guard}\n}`;

	return applyEdits(source, [{ start: statement.range[0], end: statement.range[1], text: braced }]);
}

/** The lines inside a block, or the statement itself. */
const bodyLines = ({ type, loc }: Node): number =>
	loc.end.line - loc.start.line + (type === "BlockStatement" ? -1 : 1);

function rewriteGuard(
	source: string,
	file: string,
	match: RegExpExecArray,
	offset: number,
): Change {
	const [, line, column, exit] = match;

	// A guard never has an `else`, which tells it apart from an `else if` on the same line.
	const statement = [...nodesOf(parseFile(source, file))].find(
		(node) =>
			node.type === "IfStatement" &&
			!node["alternate"] &&
			node.loc.start.line === Number(line) &&
			(!column || node.loc.start.column + 1 === Number(column)) &&
			isReported(enclosingFunction(node)!, offset),
	);

	if (!statement) {
		return NOT_FOUND;
	}

	return exitOf(statement) === exit
		? { text: invert(source, statement, exit!), lines: bodyLines(statement["consequent"] as Node) }
		: { outcome: "wrong exit" };
}

// Regions ----------------------------------------------------------------------------

/** Statements that move together, and what a jump that only ends them targets. */
interface Region {
	statements: Node[];
	owner?: Node;
	/** Do the statements sit directly in a statement list? Otherwise they need braces. */
	inList: boolean;
}

function bodyRegion(body: Node | null | undefined, owner?: Node): Region[] {
	if (!body) {
		return [];
	}

	return body.type === "BlockStatement"
		? [{ statements: body["body"] as Node[], owner, inList: true }]
		: [{ statements: [body], owner, inList: false }];
}

function caseRegion(switchCase: Node): Region {
	const statements = [...(switchCase["consequent"] as Node[])];
	const last = statements.at(-1);

	// The `break` that ends a case stays behind.
	if (last?.type === "BreakStatement" && !last["label"]) {
		statements.pop();
	}

	return { statements, owner: switchCase.parent, inList: true };
}

function loopKind(node: Node): string | undefined {
	switch (node.type) {
		case "ForStatement":
			return "for";

		case "ForInStatement":
			return "for...in";

		case "ForOfStatement":
			return node["await"] ? "for await...of" : "for...of";

		case "WhileStatement":
			return "while";

		case "DoWhileStatement":
			return "do...while";

		default:
			return undefined;
	}
}

const isElseIf = (node: Node): boolean =>
	node.type === "IfStatement" &&
	node.parent?.type === "IfStatement" &&
	node.parent["alternate"] === node;

/** The regions `node` offers under a description such as `the body of the 'if' at line 5`. */
function describedRegions(node: Node, what: string): Region[] {
	const at = (line: string | undefined, column?: string) =>
		node.loc.start.line === Number(line) &&
		(!column || node.loc.start.column + 1 === Number(column));

	const body = /^the body of the '(.+)' at line (\d+)(?:, column (\d+))?$/.exec(what);

	if (body) {
		const [, kind, line, column] = body;

		if (!at(line, column)) {
			return [];
		}

		if (node.type === "IfStatement") {
			return kind === (isElseIf(node) ? "else if" : "if")
				? bodyRegion(node["consequent"] as Node)
				: [];
		}

		return loopKind(node) === kind ? bodyRegion(node["body"] as Node, node) : [];
	}

	return otherRegions(node, what, at);
}

function otherRegions(
	node: Node,
	what: string,
	at: (line: string | undefined) => boolean,
): Region[] {
	const [, part, line] =
		/^the '(else|case|default|try|catch|finally)' (?:branch |block )?at line (\d+)$/.exec(what) ??
		[];

	if (!part || !at(line) || !PARTS[part]!(node, node.parent)) {
		return [];
	}

	if (node.type === "SwitchCase") {
		return [caseRegion(node)];
	}

	return bodyRegion(node.type === "CatchClause" ? (node["body"] as Node) : node);
}

/** Is `node` the part of its statement that a description names? */
const PARTS: Record<string, (node: Node, parent: Node | undefined) => boolean> = {
	else: (node, parent) =>
		parent?.type === "IfStatement" && parent["alternate"] === node && !isElseIf(node),
	case: (node) => node.type === "SwitchCase" && Boolean(node["test"]),
	default: (node) => node.type === "SwitchCase" && !node["test"],
	try: (node, parent) => parent?.type === "TryStatement" && parent["block"] === node,
	catch: (node) => node.type === "CatchClause",
	finally: (node, parent) => parent?.type === "TryStatement" && parent["finalizer"] === node,
};

/** Runs of a function body's top-level statements, short of the whole body. */
function statementRuns(node: Node): Region[] {
	const body = node["body"] as Node | undefined;

	if (!FUNCTIONS.has(node.type) || body?.type !== "BlockStatement") {
		return [];
	}

	const statements = body["body"] as Node[];

	return statements.flatMap((_, from) =>
		statements
			.slice(from)
			.map((__, length) => statements.slice(from, from + length + 1))
			.filter((run) => run.length < statements.length)
			.map((run) => ({ statements: run, inList: true })),
	);
}

const spans = ({ statements }: Region, first: number, last: number): boolean =>
	statements.length > 0 &&
	statements[0]!.loc.start.line === first &&
	statements.at(-1)!.loc.end.line === last;

/** The region a move hint names, in the function the diagnostic reports. */
function findRegion(ast: Node, match: RegExpExecArray, offset: number): Region | undefined {
	const [, first, last, only, what] = match;
	const firstLine = Number(first ?? only);
	const lastLine = Number(last ?? only);

	const regions = [...nodesOf(ast)].flatMap((node) =>
		what ? describedRegions(node, what) : statementRuns(node),
	);

	return regions.find((region) => {
		const unit = enclosingFunction(region.statements[0]!);

		return spans(region, firstLine, lastLine) && unit !== undefined && isReported(unit, offset);
	});
}

// Obstacles --------------------------------------------------------------------------

/** What the hint says to do about the region's obstacles. */
interface Plan {
	returns?: "every value" | "every bare" | "some value" | "some bare";
	jump?: { kind: string; label?: string };
	awaits: boolean;
	yields: boolean;
	/** The names handed back to the caller, as the hint lists them. */
	handedBack: string[];
	declared: string[];
	declareBefore?: number;
}

const RETURN_CLAUSES: Record<string, Plan["returns"]> = {
	"it returns from this function, so return its result from the caller": "every value",
	"it returns from this function, so call it and then return": "every bare",
	"it returns from this function on some paths, so have it return the result or undefined, and return that from the caller when it is defined":
		"some value",
	"it returns from this function on some paths, so have it return whether to stop, and return from the caller when it does":
		"some bare",
};

const quotedNames = (text: string): string[] =>
	[...text.matchAll(/'([^']+)'/g)].map(([, name]) => name!);

/** Reads one clause into `plan`; false when the clause isn't one the spec defines. */
function readClause(clause: string, plan: Plan): boolean {
	const jump =
		/so have it return whether to (break|continue), and (?:break|continue)(?: (\S+))? from the caller when it does$/.exec(
			clause,
		);

	const data =
		/^it (?:reassigns|declares) .*?so (?:declare (.+?) before line (\d+), )?have it return (?:the new )?(.+?),? and assign (?:it|them) from the call$/.exec(
			clause,
		);

	if (RETURN_CLAUSES[clause]) {
		plan.returns = RETURN_CLAUSES[clause];
	} else if (jump) {
		plan.jump = { kind: jump[1]!, label: jump[2] };
	} else if (clause === "it awaits, so make it async and await it") {
		plan.awaits = true;
	} else if (clause === "it yields, so make it a generator and yield* its result") {
		plan.yields = true;
	} else if (data) {
		plan.declared = data[1] ? quotedNames(data[1]) : [];

		plan.declareBefore = data[2] ? Number(data[2]) : undefined;

		plan.handedBack = quotedNames(data[3]!);
	} else {
		return false;
	}

	return true;
}

function planOf(clauses: string): Plan | undefined {
	const plan: Plan = {
		awaits: false,
		yields: false,
		handedBack: [],
		declared: [],
	};

	const list = clauses ? clauses.replace(/^; /, "").split(/, and (?=it )/) : [];

	return list.every((clause) => readClause(clause, plan)) ? plan : undefined;
}

/** Where a `break` or `continue` goes: a labeled statement, or the loop or `switch` around it. */
function jumpTarget(node: Node): Node | undefined {
	const label = (node["label"] as { name: string } | null)?.name;

	for (const up of ancestorsOf(node).reverse()) {
		if (FUNCTIONS.has(up.type)) {
			return undefined;
		}

		if (
			label
				? up.type === "LabeledStatement" && (up["label"] as { name: string }).name === label
				: LOOPS.has(up.type) || (node.type === "BreakStatement" && up.type === "SwitchStatement")
		) {
			return label ? (up["body"] as Node) : up;
		}
	}

	return undefined;
}

/** What a jump out of the region becomes in the new function, or nothing if it stays. */
function jumpEdit(node: Node, region: Region, range: [number, number]): string | undefined {
	const target = jumpTarget(node);

	if (!target || within(range, target.range)) {
		return undefined;
	}

	// Continuing the region's own loop, or breaking out of its own `switch`, ends it.
	const ends =
		target === region.owner &&
		(node.type === "ContinueStatement" || target.type === "SwitchStatement");

	return ends ? "return;" : "return true;";
}

/** The nodes under `node` that belong to its function, skipping nested functions. */
function* ownNodes(node: Node): Generator<Node> {
	if (FUNCTIONS.has(node.type)) {
		return;
	}

	yield node;

	for (const child of childrenOf(node)) {
		yield* ownNodes(child);
	}
}

const regionNodes = (region: Region): Node[] =>
	region.statements.flatMap((statement) => [...ownNodes(statement)]);

/** What the new function returns to hand back `names`. */
const handBackOf = (names: string[]): string =>
	names.length === 1 ? names[0]! : `[${names.join(", ")}]`;

function returnEdit(node: Node, plan: Plan): string | undefined {
	if (node["argument"]) {
		return undefined;
	}

	if (plan.returns === "some bare") {
		return "return true;";
	}

	// The caller assigns the handed-back names before it returns, so every exit hands them back.
	return plan.returns === "every bare" && plan.handedBack.length > 0
		? `return ${handBackOf(plan.handedBack)};`
		: undefined;
}

/** Edits to the region's own returns and jumps. */
function flowEdits(region: Region, plan: Plan, range: [number, number]): Edit[] {
	return regionNodes(region).flatMap((node) => {
		const text =
			node.type === "ReturnStatement"
				? returnEdit(node, plan)
				: node.type === "BreakStatement" || node.type === "ContinueStatement"
					? jumpEdit(node, region, range)
					: undefined;

		return text ? [{ start: node.range[0], end: node.range[1], text }] : [];
	});
}

/** The statement that takes the region's place. */
function callSite(plan: Plan, name: string): string {
	const call = `${plan.yields ? "yield* " : ""}${plan.awaits ? "await " : ""}${name}()`;
	const result = `${name}Result`;
	const names = plan.handedBack;

	// Handed-back names combine only with a plain final return; see "Obstacles" in the spec.
	const statement =
		names.length === 0
			? `${call};`
			: names.length === 1
				? `${names[0]} = ${call};`
				: `;[${names.join(", ")}] = ${call};`;

	if (plan.jump) {
		return `if (${call}) ${plan.jump.kind}${plan.jump.label ? ` ${plan.jump.label}` : ""};`;
	}

	switch (plan.returns) {
		case "every value":
			return `return ${call};`;

		case "every bare":
			return `${statement}\nreturn;`;

		case "some value":
			return `const ${result} = ${call};\nif (${result} !== undefined) return ${result};`;

		case "some bare":
			return `if (${call}) return;`;

		default:
			return statement;
	}
}

function declaration(plan: Plan, body: string, name: string): string {
	const names = plan.handedBack;

	const handBack = names.length === 0 ? "" : `\nreturn ${handBackOf(names)};`;

	return `\n${plan.awaits ? "async " : ""}function${plan.yields ? "*" : ""} ${name}() {\n${body}${handBack}\n}\n`;
}

/**
 * Inserts `let a, b;` before the statement on `line` that holds the region: no edits when
 * the hint declares nothing, and undefined when no such statement is found.
 */
function declareEdits(region: Region, plan: Plan): Edit[] | undefined {
	if (plan.declared.length === 0) {
		return [];
	}

	const first = region.statements[0]!;

	const holder = [first, ...ancestorsOf(first).reverse()].find(
		(node) => node.loc.start.line === plan.declareBefore && LISTS.has(node.parent?.type ?? ""),
	);

	return (
		holder && [
			{
				start: holder.range[0],
				end: holder.range[0],
				text: `let ${plan.declared.join(", ")}; `,
			},
		]
	);
}

function rewriteMove(
	source: string,
	file: string,
	match: RegExpExecArray,
	offset: number,
	name: string,
): Change {
	const plan = planOf(match[5]!);

	if (!plan) {
		return { outcome: "not applied" };
	}

	const region = findRegion(parseFile(source, file), match, offset);

	if (!region) {
		return NOT_FOUND;
	}

	// A `return` the hint leaves out would stay in the new function, where it still parses
	// and the call site's `if` is never added, so the scores alone wouldn't show it.
	if (!plan.returns && regionNodes(region).some(({ type }) => type === "ReturnStatement")) {
		return { outcome: "return not named" };
	}

	const range: [number, number] = [
		region.statements[0]!.range[0],
		region.statements.at(-1)!.range[1],
	];

	const declare = declareEdits(region, plan);

	if (!declare) {
		return NOT_FOUND;
	}

	const body = applyEdits(source.slice(...range), flowEdits(region, plan, range), range[0]);
	const site = region.inList ? callSite(plan, name) : `{\n${callSite(plan, name)}\n}`;
	const unit = enclosingFunction(region.statements[0]!)!["body"] as Node;

	return {
		lines: region.statements.at(-1)!.loc.end.line - region.statements[0]!.loc.start.line + 1,
		text: applyEdits(source, [
			{ start: range[0], end: range[1], text: site },
			{ start: unit.range[1] - 1, end: unit.range[1] - 1, text: declaration(plan, body, name) },
			...declare,
		]),
	};
}

function rewriteHelper(
	source: string,
	file: string,
	match: RegExpExecArray,
	offset: number,
	name: string,
): Change {
	const [, line, column, clauses] = match;
	const plan = planOf(clauses!);

	if (!plan || plan.returns || plan.jump || plan.handedBack.length > 0) {
		return { outcome: "not applied" };
	}

	const ternary = [...nodesOf(parseFile(source, file))].find(
		(node) =>
			node.type === "ConditionalExpression" &&
			node.loc.start.line === Number(line) &&
			node.loc.start.column + 1 === Number(column),
	);

	const unit = ternary && enclosingFunction(ternary);

	if (!ternary || !unit || !isReported(unit, offset)) {
		return NOT_FOUND;
	}

	const call = `(${plan.yields ? "yield* " : ""}${plan.awaits ? "await " : ""}${name}())`;
	const helper = declaration(plan, `return (${source.slice(...ternary.range)});`, name);
	const body = unit["body"] as Node;
	const replaced = { start: ternary.range[0], end: ternary.range[1], text: call };
	const lines = ternary.loc.end.line - ternary.loc.start.line + 1;

	if (body.type === "BlockStatement") {
		return {
			lines,
			text: applyEdits(source, [
				replaced,
				{ start: body.range[1] - 1, end: body.range[1] - 1, text: helper },
			]),
		};
	}

	// An arrow with an expression body gets a block, so the helper has somewhere to go. The
	// body's range leaves out any parentheses around it, so everything after `=>` goes.
	const start = source.lastIndexOf("=>", body.range[0]) + 2;
	const end = unit.range[1];
	const expression = applyEdits(source.slice(start, end), [replaced], start);

	return {
		lines,
		text: applyEdits(source, [{ start, end, text: ` {\nreturn (${expression});${helper}}` }]),
	};
}

// Putting it together ----------------------------------------------------------------

/**
 * Where the diagnostic sits in `source`. Oxlint's `offset` and `column` count bytes, which
 * drift from string positions after any non-ASCII text, so the position comes from the
 * line, and the column is converted within it.
 */
function reportOffset(source: string, diagnostic: Diagnostic): number {
	const { line, column } = diagnostic.labels[0]!.span;
	const lines = source.split("\n");
	const lineStart = lines.slice(0, line - 1).join("\n").length + (line > 1 ? 1 : 0);

	return (
		lineStart +
		Buffer.from(lines[line - 1]!)
			.subarray(0, column - 1)
			.toString().length
	);
}

/** How many functions `source` declares, of any kind. */
export const countFunctions = (source: string, file: string): number =>
	[...nodesOf(parseFile(source, file))].filter(({ type }) => FUNCTIONS.has(type)).length;

/** The range of the body of the function `diagnostic` reports, if it's found. */
export function reportedBody(source: string, diagnostic: Diagnostic): [number, number] | undefined {
	const offset = reportOffset(source, diagnostic);

	// The last match is the innermost, since `nodesOf` visits parents first.
	const unit = [...nodesOf(parseFile(source, diagnostic.filename))].findLast(
		(node) => FUNCTIONS.has(node.type) && isReported(node, offset),
	);

	return (unit?.["body"] as Node | undefined)?.range;
}

/**
 * `diagnostic`'s hint applied to `source`, its file's text, unless it promises no score.
 * A move or helper's new function is called `name`.
 */
export function rewrite(source: string, diagnostic: Diagnostic, name = MOVED): Rewrite | undefined {
	const { message, filename } = diagnostic;
	const offset = reportOffset(source, diagnostic);
	const before = scoreOf(message);
	const guard = GUARD.exec(message);

	if (guard) {
		const promised = { remaining: Number(guard[4]) };

		return {
			kind: "guard",
			before,
			promised,
			...rewriteGuard(source, filename, guard, offset),
		};
	}

	const move = MOVE.exec(message);

	if (move) {
		const promised = { remaining: Number(move[6]), moved: Number(move[7]) };

		return {
			kind: "move",
			before,
			promised,
			...rewriteMove(source, filename, move, offset, name),
		};
	}

	const helper = HELPER.exec(message);

	if (helper) {
		const promised = { remaining: Number(helper[4]), moved: Number(helper[5]) };

		return {
			kind: "helper",
			before,
			promised,
			...rewriteHelper(source, filename, helper, offset, name),
		};
	}

	return undefined;
}

/** Oxlint's JSON report of a lint run. */
export interface Report {
	diagnostics: Diagnostic[];
}

/**
 * How the rewritten copy scores, from `diagnostics`: the rule's reports for the copy, at
 * max 0, so every function that scores at all is reported. The function's report sits at
 * its name, keyword or `=>`, before the body, so the rewrite never moves it. `rule` is
 * the rule's code in the report, and `name` the one the rewrite gave a new function.
 */
export function check(
	diagnostics: readonly Diagnostic[],
	diagnostic: Diagnostic,
	rewritten: Rewrite,
	{ rule = RULE, name = MOVED } = {},
): Checked {
	const { before, promised } = rewritten;

	// With every other rule off, anything else is a parse error, such as a name clash.
	if (diagnostics.some(({ code }) => code !== rule)) {
		return { outcome: "doesn't parse" };
	}

	const { span } = diagnostic.labels[0]!;

	const same = diagnostics.find(
		({ labels }) => labels[0]!.span.line === span.line && labels[0]!.span.column === span.column,
	);

	if (!same && promised.remaining !== 0) {
		return { outcome: "not reported" };
	}

	const after = same ? scoreOf(same.message) : 0;
	const report = diagnostics.find(({ message }) => message.startsWith(`Function '${name}' `));
	const moved = promised.moved === undefined ? undefined : report ? scoreOf(report.message) : 0;

	if (after === promised.remaining && moved === promised.moved) {
		return { after, moved, outcome: "as promised" };
	}

	return {
		after,
		moved,
		outcome: Math.max(after, moved ?? 0) < before ? "lower, not as promised" : "not lower",
	};
}

/** A diagnostic whose hint was applied, with what came of it. */
export interface Applied extends Checked {
	diagnostic: Diagnostic;
	kind: FixKind;
	before: number;
	promised: Promised;
}

/**
 * Applies every hint in `diagnostics` that makes a promise, each to its own copy of its
 * file beside it, lints all the copies in one run, and checks each against its promise.
 * The copies keep their file's extension, so they parse the same way, and are removed
 * afterwards. `lint` runs Oxlint at max 0 from `dir` over the paths it's given.
 */
export function applyAll(
	dir: string,
	diagnostics: readonly Diagnostic[],
	lint: (paths: string[]) => Report,
): Applied[] {
	const rewrites = diagnostics.flatMap((diagnostic) => {
		const rewritten = rewrite(readFileSync(join(dir, diagnostic.filename), "utf8"), diagnostic);

		return rewritten ? [{ diagnostic, rewritten }] : [];
	});

	// Indexed like `rewrites`, with a copy for each rewrite that has text.
	const copies: (string | undefined)[] = [];

	try {
		for (const [index, { diagnostic, rewritten }] of rewrites.entries()) {
			if ("text" in rewritten) {
				const { filename } = diagnostic;
				const copy = join(dirname(filename), `.hint-eval-${index}-${basename(filename)}`);

				writeFileSync(join(dir, copy), rewritten.text);

				copies[index] = copy;
			}
		}

		const written = copies.filter((copy) => copy !== undefined);
		const report = written.length > 0 ? lint(written) : { diagnostics: [] };

		const reportsFor = (copy: string) =>
			report.diagnostics.filter(({ filename }) => normalize(filename) === normalize(copy));

		return rewrites.map(({ diagnostic, rewritten }, index) => {
			const { kind, before, promised } = rewritten;

			const checked =
				"text" in rewritten
					? check(reportsFor(copies[index]!), diagnostic, rewritten)
					: { outcome: rewritten.outcome };

			return {
				diagnostic,
				kind,
				before,
				promised,
				...checked,
			};
		});
	} finally {
		for (const copy of copies) {
			if (copy) {
				rmSync(join(dir, copy));
			}
		}
	}
}

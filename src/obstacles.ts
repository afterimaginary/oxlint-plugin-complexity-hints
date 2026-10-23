import type { ESTree, Reference, Scope, ScopeManager, Variable } from "@oxlint/plugins";
import { isFunctionUnit, isLoop, type FunctionUnit } from "./scoring.ts";

/**
 * What stands in the way of moving a region into a new function unchanged, and how
 * to work around it. See "Obstacles" in docs/specs/diagnostics.md.
 */
export interface Obstacles {
	/** One clause per obstacle: `it <does something>, so <workaround>`. */
	clauses: string[];
	/** Points the workaround adds back to this function: an `if` at the call site. */
	cost: number;
	/** Points the new function loses: labeled jumps that become a `return`. */
	movedDelta: number;
}

/** The part of a unit a region covers, and what the analysis needs to know about it. */
export interface RegionShape {
	/** The region's statements, or the one expression of a ternary region. */
	nodes: readonly ESTree.Node[];
	start: number;
	end: number;
	/** The nesting level of the region's contents, where the call to the new function goes. */
	depth: number;
	/** The loop whose body, or the `switch` whose case, the region is: a jump to it becomes `return`. */
	owner?: ESTree.Node;
	/** Whether the region's block-scoped `using` declarations would be disposed earlier once moved. */
	disposesEarly: boolean;
	ternary: boolean;
}

/** Everything about a unit's scopes that the analysis of any of its regions needs. */
export interface UnitScopes {
	unit: FunctionUnit;
	/** Every reference made inside the unit, in source order. */
	references: readonly Reference[];
}

function inside(node: { start: number; end: number }, range: { start: number; end: number }) {
	return node.start >= range.start && node.end <= range.end;
}

function allScopes(scope: Scope): Scope[] {
	return [scope, ...scope.childScopes.flatMap(allScopes)];
}

export function unitScopes(unit: FunctionUnit, scopeManager: ScopeManager): UnitScopes {
	const scope = scopeManager.acquire(unit);
	const references = scope ? allScopes(scope).flatMap((each) => each.references) : [];

	return {
		unit,
		references: references.toSorted((a, b) => a.identifier.start - b.identifier.start),
	};
}

// Control flow -----------------------------------------------------------------------

interface Jump {
	kind: "break" | "continue";
	label?: string;
	/** The statement the jump leaves: its loop or `switch`, or its labeled statement's body. */
	target: ESTree.Node;
}

interface Flow {
	returns: ESTree.ReturnStatement[];
	jumps: Jump[];
	/** Labeled jumps that leave the region; each is an increment the new function loses. */
	labeledLeaving: number;
	awaits: boolean;
	yields: boolean;
	usings: boolean;
}

/** Is this `return` bare: no value, `undefined` or `void …`? */
function isBare({ argument }: ESTree.ReturnStatement): boolean {
	return (
		!argument ||
		(argument.type === "Identifier" && argument.name === "undefined") ||
		(argument.type === "UnaryExpression" && argument.operator === "void")
	);
}

/** The loop, or for `break` also the `switch`, an unlabeled jump at `node` targets. */
function jumpTarget(node: ESTree.Node, kind: Jump["kind"]): ESTree.Node | undefined {
	for (let parent = node.parent; parent && !isFunctionUnit(parent); parent = parent.parent) {
		if (isLoop(parent) || (kind === "break" && parent.type === "SwitchStatement")) {
			return parent;
		}
	}

	return undefined;
}

/** The statement a labeled jump targets: the body of the labeled statement. */
function labelTarget(node: ESTree.Node, label: string): ESTree.Node | undefined {
	for (let parent = node.parent; parent && !isFunctionUnit(parent); parent = parent.parent) {
		if (parent.type === "LabeledStatement" && parent.label.name === label) {
			return parent.body;
		}
	}

	return undefined;
}

function childrenOf(node: ESTree.Node): ESTree.Node[] {
	const children: ESTree.Node[] = [];

	for (const [key, value] of Object.entries(node)) {
		if (key === "parent") {
			continue;
		}

		for (const item of Array.isArray(value) ? value : [value]) {
			if (item && typeof item === "object" && typeof item.type === "string") {
				children.push(item as ESTree.Node);
			}
		}
	}

	return children;
}

function isUsing(node: ESTree.Node): boolean {
	return (
		node.type === "VariableDeclaration" && (node.kind === "using" || node.kind === "await using")
	);
}

/** Records a jump that leaves `region`; jumps to a target inside it stay inside. */
function recordJump(
	node: ESTree.BreakStatement | ESTree.ContinueStatement,
	region: RegionShape,
	flow: Flow,
): void {
	const kind = node.type === "BreakStatement" ? "break" : "continue";
	const label = node.label?.name;
	const target = label ? labelTarget(node, label) : jumpTarget(node, kind);

	if (!target || inside(target, region)) {
		return;
	}

	if (label) {
		flow.labeledLeaving += 1;
	}

	// Continuing the loop whose body the region is, or breaking out of the `switch` whose
	// case it is, ends the region, so it becomes a plain `return`. Breaking out of the
	// region's own loop does not: the caller still has to stop the loop.
	const endsRegion =
		target === region.owner && (kind === "continue" || target.type === "SwitchStatement");

	if (!endsRegion) {
		flow.jumps.push({ kind, label, target });
	}
}

function visit(node: ESTree.Node, region: RegionShape, flow: Flow): void {
	// A nested function has its own control flow; it moves with the code.
	if (isFunctionUnit(node)) {
		return;
	}

	switch (node.type) {
		case "ReturnStatement":
			flow.returns.push(node);

			break;

		case "YieldExpression":
			flow.yields = true;

			break;

		case "AwaitExpression":
			flow.awaits = true;

			break;

		case "ForOfStatement":
			flow.awaits ||= node.await;

			break;

		case "VariableDeclaration":
			flow.awaits ||= node.kind === "await using";

			break;

		case "BreakStatement":
		case "ContinueStatement":
			recordJump(node, region, flow);

			break;

		default:
			break;
	}

	for (const child of childrenOf(node)) {
		visit(child, region, flow);
	}
}

function flowOf(region: RegionShape): Flow {
	const flow: Flow = {
		returns: [],
		jumps: [],
		labeledLeaving: 0,
		awaits: false,
		yields: false,
		usings: region.nodes.some(isUsing),
	};

	for (const node of region.nodes) {
		visit(node, region, flow);
	}

	return flow;
}

/** Does any `break` in `statement` target it? */
function isBrokenOutOf(statement: ESTree.SwitchStatement): boolean {
	const breaks = (node: ESTree.Node): boolean => {
		if (isFunctionUnit(node)) {
			return false;
		}

		if (node.type === "BreakStatement" && !node.label && jumpTarget(node, "break") === statement) {
			return true;
		}

		return childrenOf(node).some(breaks);
	};

	return statement.cases.some((switchCase) => switchCase.consequent.some(breaks));
}

/** Can control never fall off the end of `node`? Loops, labels and `try` are not followed. */
function exits(node: ESTree.Node | null | undefined): boolean {
	switch (node?.type) {
		case "ReturnStatement":
		case "ThrowStatement":
			return true;

		case "BlockStatement":
			return exits(node.body.at(-1));

		case "IfStatement":
			return exits(node.consequent) && exits(node.alternate);

		case "SwitchStatement":
			return (
				node.cases.some((switchCase) => !switchCase.test) &&
				node.cases.at(-1)!.consequent.length > 0 &&
				node.cases.every(({ consequent }) => consequent.length === 0 || exits(consequent.at(-1))) &&
				!isBrokenOutOf(node)
			);

		default:
			return false;
	}
}

// Data -------------------------------------------------------------------------------

interface Data {
	reassigned: string[];
	declared: string[];
	/** The line before which the declared names go: see `declarationLine`. */
	declareBefore?: number;
}

/** The function scope's block a reference is made from. */
function functionOf(reference: Reference): ESTree.Node {
	return reference.from.variableScope.block;
}

function outsideUnit(variable: Variable, unit: FunctionUnit): boolean {
	return !inside(variable.scope.block, unit);
}

/** Loops between the region and its unit that also lie inside `variable`'s scope. */
function carryingLoops(region: RegionShape, variable: Variable): ESTree.Node[] {
	const loops: ESTree.Node[] = [];

	for (let node = region.nodes[0]!.parent; node && !isFunctionUnit(node); node = node.parent) {
		if (isLoop(node) && inside(node, variable.scope.block)) {
			loops.push(node);
		}
	}

	return loops;
}

/** Is a new value written in `region` read later: after it, on a loop's next pass, or by a closure? */
function isObserved(variable: Variable, region: RegionShape, scopes: UnitScopes): boolean {
	if (outsideUnit(variable, scopes.unit)) {
		// The unit can run again, and anything around it may read the value.
		return true;
	}

	const loops = carryingLoops(region, variable);

	return variable.references.some(
		(reference) =>
			reference.isRead() &&
			(reference.identifier.start > region.end ||
				functionOf(reference) !== scopes.unit ||
				loops.some((loop) => inside(reference.identifier, loop))),
	);
}

/**
 * The line of the statement, in the innermost statement list that holds the region
 * and every reference to `variables`, that contains the region: declaring there keeps
 * every use in scope.
 */
function declarationLine(region: RegionShape, variables: readonly Variable[]): number {
	const references = variables.flatMap((variable) => variable.references);
	let child: ESTree.Node = region.nodes[0]!;

	for (let parent = child.parent; parent; child = parent, parent = parent.parent) {
		const isList = parent.type === "BlockStatement" || parent.type === "Program";

		if (isList && references.every((reference) => inside(reference.identifier, parent!))) {
			break;
		}
	}

	return child.loc.start.line;
}

type Verdict = "none" | "reassigned" | "declared" | "skip";

function classify(variable: Variable, region: RegionShape, scopes: UnitScopes): Verdict {
	const defsIn = variable.defs.filter((def) => inside(def.name, region));

	// An initial value counts too: with a declaration outside as well, `var x = …` reassigns.
	const writesIn = variable.references.filter(
		(reference) => reference.isWrite() && inside(reference.identifier, region),
	);

	// A closure created in the region that writes the variable can't hand the value back.
	if (writesIn.some((reference) => functionOf(reference) !== scopes.unit)) {
		return "skip";
	}

	if (defsIn.length > 0 && defsIn.length === variable.defs.length) {
		return classifyDeclared(variable, region);
	}

	return writesIn.length > 0 && isObserved(variable, region, scopes) ? "reassigned" : "none";
}

function classifyDeclared(variable: Variable, region: RegionShape): Verdict {
	const outside = variable.references.filter((reference) => !inside(reference.identifier, region));

	if (outside.length === 0) {
		return "none";
	}

	// Used before the region (hoisting), or disposed when the new function returns.
	const usesBefore = outside.some((reference) => reference.identifier.start < region.start);
	const disposed = variable.defs.some((def) => def.parent && isUsing(def.parent));

	return usesBefore || disposed ? "skip" : "declared";
}

/** The variables `region` refers to that a move could cut off, or `undefined` to skip it. */
function dataOf(region: RegionShape, scopes: UnitScopes): Data | undefined {
	const variables = new Set<Variable>();

	for (const reference of scopes.references) {
		const { resolved } = reference;
		const kind = resolved?.scope.type;

		// Module-level variables reach a new function anywhere in the module, and ones
		// scoped inside the region move with it.
		const reaches =
			resolved &&
			kind !== "module" &&
			kind !== "global" &&
			!inside(resolved.scope.block, region) &&
			inside(reference.identifier, region);

		if (reaches) {
			variables.add(resolved);
		}
	}

	const data: Data = { reassigned: [], declared: [] };
	const declared: Variable[] = [];

	for (const variable of variables) {
		const verdict = classify(variable, region, scopes);

		if (verdict === "skip") {
			return undefined;
		}

		if (verdict === "reassigned") {
			data.reassigned.push(variable.name);
		} else if (verdict === "declared") {
			data.declared.push(variable.name);

			declared.push(variable);
		}
	}

	if (declared.length > 0) {
		data.declareBefore = declarationLine(region, declared);
	}

	return data;
}

// Wording ----------------------------------------------------------------------------

const SHOWN_NAMES = 3;

/** `'a'`, `'a' and 'b'`, `'a', 'b' and 'c'`, `'a', 'b', 'c' and 2 more`. */
function names(list: readonly string[]): string {
	const quoted = list.map((name) => `'${name}'`);

	if (quoted.length > SHOWN_NAMES) {
		return `${quoted.slice(0, SHOWN_NAMES).join(", ")} and ${quoted.length - SHOWN_NAMES} more`;
	}

	return quoted.length > 1 ? `${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)}` : quoted[0]!;
}

const STATEMENT_KINDS: Partial<Record<ESTree.Node["type"], string>> = {
	ForStatement: "'for'",
	ForInStatement: "'for...in'",
	WhileStatement: "'while'",
	DoWhileStatement: "'do...while'",
	SwitchStatement: "'switch'",
};

function targetText(target: ESTree.Node): string {
	const kind =
		target.type === "ForOfStatement"
			? target.await
				? "'for await...of'"
				: "'for...of'"
			: STATEMENT_KINDS[target.type];

	return `the ${kind ?? "statement"} at line ${target.loc.start.line}`;
}

function jumpClause({ kind, label, target }: Jump): string {
	const what = label
		? kind === "break"
			? `breaks to '${label}'`
			: `continues '${label}'`
		: kind === "break"
			? `breaks out of ${targetText(target)}`
			: `continues ${targetText(target)}`;

	const statement = label ? `${kind} ${label}` : kind;

	return `it ${what}, so have it return whether to ${kind}, and ${statement} from the caller when it does`;
}

function returnClause(everyPath: boolean, bare: boolean): string {
	if (everyPath) {
		return bare
			? "it returns from this function, so call it and then return"
			: "it returns from this function, so return its result from the caller";
	}

	return bare
		? "it returns from this function on some paths, so have it return whether to stop, and return from the caller when it does"
		: "it returns from this function on some paths, so have it return the result or undefined, and return that from the caller when it is defined";
}

function dataClause({ reassigned, declared, declareBefore }: Data): string {
	const all = names([...reassigned, ...declared]);
	const them = reassigned.length + declared.length > 1 ? "them" : "it";

	if (declared.length === 0) {
		return `it reassigns ${all}, which the code around it reads, so have it return the new ${all} and assign ${them} from the call`;
	}

	const declare = `declare ${names(declared)} before line ${declareBefore}, `;

	const what =
		reassigned.length === 0
			? `declares ${all}, which the code after it uses`
			: `reassigns ${names(reassigned)} and declares ${names(declared)}, which the code around it reads`;

	const value = reassigned.length === 0 ? all : `the new ${all}`;

	return `it ${what}, so ${declare}have it return ${value}, and assign ${them} from the call`;
}

// Putting it together ----------------------------------------------------------------

/** One jump target for every leaving jump, or `undefined` when they differ. */
function sharedJump(jumps: readonly Jump[]): Jump | undefined {
	const [first] = jumps;

	return jumps.every(({ kind, target }) => kind === first?.kind && target === first.target)
		? first
		: undefined;
}

/** A way the new function hands something back to the caller; it can only have one. */
interface Channel {
	clause: string;
	cost: number;
}

interface Returns {
	any: boolean;
	everyPath: boolean;
	bare: boolean;
}

function returnChannel({ any, everyPath, bare }: Returns, callSiteIf: number): Channel[] {
	// `f(); return;` needs nothing back from the new function.
	if (!any || (everyPath && bare)) {
		return [];
	}

	return [{ clause: returnClause(everyPath, bare), cost: everyPath ? 0 : callSiteIf }];
}

function jumpChannel(jump: Jump | undefined, callSiteIf: number): Channel[] {
	return jump ? [{ clause: jumpClause(jump), cost: callSiteIf + (jump.label ? 1 : 0) }] : [];
}

function hasNames({ reassigned, declared }: Data): boolean {
	return reassigned.length + declared.length > 0;
}

function dataChannel(data: Data): Channel[] {
	return hasNames(data) ? [{ clause: dataClause(data), cost: 0 }] : [];
}

/** Clauses that need nothing handed back: a plain final return, `async`, a generator. */
function freeClauses(flow: Flow, { everyPath, bare }: Returns): string[] {
	return [
		...(flow.returns.length > 0 && everyPath && bare ? [returnClause(true, true)] : []),
		...(flow.awaits ? ["it awaits, so make it async and await it"] : []),
		...(flow.yields ? ["it yields, so make it a generator and yield* its result"] : []),
	];
}

function returnsOf(flow: Flow, region: RegionShape): Returns | undefined {
	const any = flow.returns.length > 0;
	const everyPath = any && flow.jumps.length === 0 && exits(region.nodes.at(-1));
	const bare = flow.returns.every(isBare);

	// Some bare and some valued returns on some paths: no one value tells the caller what to do.
	if (!everyPath && !bare && flow.returns.some(isBare)) {
		return undefined;
	}

	return { any, everyPath, bare };
}

/**
 * What stands in the way of moving `region` unchanged, or `undefined` when there is
 * no standard way around it: the new function can hand back only one thing.
 */
export function obstaclesOf(region: RegionShape, scopes: UnitScopes): Obstacles | undefined {
	const flow = flowOf(region);
	const returns = returnsOf(flow, region);
	const jump = sharedJump(flow.jumps);

	if (!returns || (flow.usings && region.disposesEarly) || (flow.jumps.length > 0 && !jump)) {
		return undefined;
	}

	// Code after a region that always returns never runs, so nothing it writes is read.
	const data = returns.everyPath ? { reassigned: [], declared: [] } : dataOf(region, scopes);

	if (!data || (region.ternary && hasNames(data))) {
		return undefined;
	}

	const callSiteIf = 1 + region.depth;

	const channels = [
		...returnChannel(returns, callSiteIf),
		...jumpChannel(jump, callSiteIf),
		...dataChannel(data),
	];

	if (channels.length > 1) {
		return undefined;
	}

	return {
		clauses: [...channels.map(({ clause }) => clause), ...freeClauses(flow, returns)],
		cost: channels.reduce((sum, { cost }) => sum + cost, 0),
		movedDelta: flow.labeledLeaving,
	};
}

import fc from "fast-check";

/**
 * Random TSX modules for the differential fuzz test: functions built from the constructs
 * the scoring spec counts or deliberately ignores, nested in each other, in closures and
 * classes, and in the positions that attribution and nesting depend on (conditions, loop
 * headers, `case` tests, parameter defaults, field initializers, static blocks). Every
 * program parses as a module, so a disagreement is always about scores.
 *
 * Two shapes are left out. Functions never sit directly in a ternary branch, and programs
 * are never sloppy-mode scripts: those are the branch-position shapes where scores
 * knowingly differ from eslint-plugin-sonarjs (ADR-0002), and fixtures pin them instead.
 */

/** Where a statement sits, which decides the jumps and returns it may make. */
interface Context {
	loop: boolean;
	breakable: boolean;
	/** Labels of the loops around it, in this function: `break` and `continue` targets. */
	loopLabels: string[];
	/** Labels of the plain blocks around it, in this function: `break` targets only. */
	blockLabels: string[];
	/** Whether `for await` is allowed. */
	async: boolean;
	/** Whether `return` is allowed: not in a class static block. */
	returns: boolean;
}

/** How deep statements and expressions may nest. */
const DEPTH = 3;

const leaves = fc.constantFrom("a", "b", "c", "x.y", "f()", "f0()", "!a", "items.length", "0");

// Arbitraries are built eagerly and recursively, so each depth (and context) is built once
// and shared; without the caches the tree grows exponentially with DEPTH.
const expressions = new Map<number, fc.Arbitrary<string>>();

/** An expression, with logical chains, ternaries, type wrappers, closures and JSX. */
function expression(depth: number): fc.Arbitrary<string> {
	const cached = expressions.get(depth);

	if (cached) {
		return cached;
	}

	const inner = depth === 0 ? leaves : expression(depth - 1);

	const arbitrary =
		depth === 0
			? leaves
			: fc.oneof(
					{ weight: 3, arbitrary: leaves },
					fc
						.tuple(inner, fc.constantFrom("&&", "||"), inner)
						.map(([left, operator, right]) => `${left} ${operator} ${right}`),
					// `??` can't share a chain with `&&` or `||` unparenthesized.
					fc.tuple(inner, inner).map(([left, right]) => `((${left}) ?? (${right}))`),
					inner.map((operand) => `(${operand})`),
					inner.map((operand) => `!(${operand})`),
					inner.map((operand) => `(${operand})!`),
					inner.map((operand) => `((${operand}) as boolean)`),
					fc.tuple(inner, inner, inner).map(([test, yes, no]) => `(${test} ? ${yes} : ${no})`),
					inner.map((body) => `f(() => ${body})`),
					inner.map((body) => `f(function named() { return ${body}; })`),
					inner.map((body) => `a?.b?.(${body})`),
					inner.map((body) => `<div>{${body}}</div>`),
					inner.map((body) => `<div hidden={${body}} />`),
					inner.map((test) => `<>{${test} && <i />}</>`),
					inner.map((test) => `<>{${test} ? <b /> : <i />}</>`),
				);

	expressions.set(depth, arbitrary);

	return arbitrary;
}

const statements = new Map<string, fc.Arbitrary<string>>();

/** A function body's own context: no loop, label or `switch` reaches into it. */
const fresh = (async: boolean, returns = true): Context => ({
	loop: false,
	breakable: false,
	loopLabels: [],
	blockLabels: [],
	async,
	returns,
});

/** A brace-delimited block of up to three statements. */
function block(context: Context, depth: number): fc.Arbitrary<string> {
	return fc
		.array(statement(context, depth), { maxLength: 3 })
		.map((body) => `{\n${body.join("\n")}\n}`);
}

/** The statements that end where they start: expressions, assignments, returns and jumps. */
function simple(context: Context, depth: number): fc.Arbitrary<string> {
	const value = expression(depth);

	const jumps = [
		...(context.breakable ? ["break;"] : []),
		...(context.loop ? ["continue;"] : []),
		...context.loopLabels.flatMap((label) => [`break ${label};`, `continue ${label};`]),
		...context.blockLabels.map((label) => `break ${label};`),
	];

	return fc.oneof(
		value.map((it) => `${it};`),
		value.map((it) => `x = ${it};`),
		fc
			.tuple(fc.constantFrom("&&=", "||=", "??="), value)
			.map(([operator, it]) => `x ${operator} ${it};`),
		...(context.returns ? [value.map((it) => `return ${it};`), fc.constant("return;")] : []),
		...(jumps.length > 0 ? [fc.constantFrom(...jumps)] : []),
	);
}

/** A loop of each kind, with expressions in its header and `body` as its body. */
function loops(context: Context, depth: number, body: fc.Arbitrary<string>): fc.Arbitrary<string> {
	const value = expression(depth - 1);

	return fc.oneof(
		fc
			.tuple(value, value, body)
			.map(([init, test, it]) => `for (let i = ${init}; ${test}; i++) ${it}`),
		fc.tuple(value, body).map(([object, it]) => `for (const k in ${object}) ${it}`),
		fc.tuple(value, body).map(([iterable, it]) => `for (const v of ${iterable}) ${it}`),
		...(context.async
			? [fc.tuple(value, body).map(([iterable, it]) => `for await (const v of ${iterable}) ${it}`)]
			: []),
		fc.tuple(value, body).map(([test, it]) => `while (${test}) ${it}`),
		fc.tuple(body, value).map(([it, test]) => `do ${it} while (${test});`),
	);
}

/** A function or class of each kind, as a statement; each function has a fresh context. */
function functions(depth: number): fc.Arbitrary<string> {
	const syncBody = block(fresh(false), depth - 1);
	const asyncBody = block(fresh(true), depth - 1);
	const staticBody = block(fresh(false, false), depth - 1);
	const value = expression(depth - 1);

	// Declarations get a block of their own, so their names can never clash.
	return fc.oneof(
		fc.tuple(value, syncBody).map(([init, body]) => `{ function inner(p = ${init}) ${body} }`),
		fc.tuple(value, syncBody).map(([init, body]) => `f((p = ${init}) => ${body});`),
		asyncBody.map((body) => `f(async function () ${body});`),
		syncBody.map((body) => `f(function named() ${body});`),
		syncBody.map((body) => `(() => ${body})();`),
		syncBody.map((body) => `f({ m() ${body} });`),
		syncBody.map((body) => `f({ key: function () ${body} });`),
		fc
			.tuple(syncBody, syncBody)
			.map(([getter, setter]) => `f({ get p() ${getter}, set p(v) ${setter} });`),
		fc
			.tuple(syncBody, syncBody)
			.map(([constructor, method]) => `{ class K { constructor() ${constructor} m() ${method} } }`),
		fc
			.tuple(value, value, staticBody)
			.map(
				([field, arrow, initializer]) =>
					`{ class K { field = ${field}; arrow = () => ${arrow}; static ${initializer} } }`,
			),
	);
}

/** Any statement that `context` allows, nested at most `depth` deep. */
function statement(context: Context, depth: number): fc.Arbitrary<string> {
	const key = `${JSON.stringify(context)}@${depth}`;
	const cached = statements.get(key);

	if (cached) {
		return cached;
	}

	if (depth === 0) {
		const leaf = simple(context, 0);

		statements.set(key, leaf);

		return leaf;
	}

	const test = expression(depth - 1);
	const here = block(context, depth - 1);
	const inLoop = { ...context, loop: true, breakable: true };
	const loopLabel = `L${depth}`;
	const blockLabel = `B${depth}`;
	const labeledLoop = { ...inLoop, loopLabels: [...context.loopLabels, loopLabel] };
	const labeledBlock = { ...context, blockLabels: [...context.blockLabels, blockLabel] };
	const inSwitch = statement({ ...context, breakable: true }, depth - 1);

	const arbitrary = fc.oneof(
		{ weight: 3, arbitrary: simple(context, depth - 1) },
		fc
			.tuple(
				test,
				here,
				fc.array(fc.tuple(test, here), { maxLength: 2 }),
				fc.option(here, { nil: undefined }),
			)
			.map(
				([condition, then, elseIfs, otherwise]) =>
					`if (${condition}) ${then}` +
					elseIfs.map(([other, body]) => ` else if (${other}) ${body}`).join("") +
					(otherwise === undefined ? "" : ` else ${otherwise}`),
			),
		fc.tuple(test, simple(context, 0)).map(([condition, then]) => `if (${condition}) ${then}`),
		loops(context, depth, block(inLoop, depth - 1)),
		loops(context, depth, block(labeledLoop, depth - 1)).map((loop) => `${loopLabel}: ${loop}`),
		block(labeledBlock, depth - 1).map((body) => `${blockLabel}: ${body}`),
		fc
			.tuple(test, test, fc.array(inSwitch, { maxLength: 2 }), fc.array(inSwitch, { maxLength: 2 }))
			// The test goes in a call: in TSX, `case (a):` before a statement parses as the
			// start of an arrow function with a return type.
			.map(
				([discriminant, label, first, rest]) =>
					`switch (${discriminant}) {\ncase f(${label}):\n${first.join("\n")}\nbreak;\ndefault:\n${rest.join("\n")}\n}`,
			),
		fc
			.tuple(here, here, fc.boolean())
			.map(
				([body, handler, final]) => `try ${body} catch (e) ${handler}${final ? " finally {}" : ""}`,
			),
		fc
			.tuple(here, test, here)
			.map(([body, init, handler]) => `try ${body} catch ({ m = ${init} }) ${handler}`),
		here.map((body) => `try ${body} finally {}`),
		here,
		functions(depth),
	);

	statements.set(key, arbitrary);

	return arbitrary;
}

/** The top-level functions of a module; `NAME` and `DEFAULT` are filled in by position. */
const units = fc.oneof(
	fc
		.tuple(expression(DEPTH - 1), block(fresh(false), DEPTH))
		.map(([init, body]) => `function NAME(a = ${init}, b) ${body}`),
	block(fresh(true), DEPTH).map((body) => `export async function NAME() ${body}`),
	block(fresh(false), DEPTH).map((body) => `DEFAULT () ${body}`),
	block(fresh(false), DEPTH).map((body) => `f(() => ${body});`),
);

/** A module of one to three top-level functions, at most one of them the default export. */
export const programs: fc.Arbitrary<string> = fc
	.array(units, { minLength: 1, maxLength: 3 })
	.map((list) => {
		let exported = false;

		const named = list.map((unit, index) => {
			const isDefault = unit.startsWith("DEFAULT");
			const keyword = isDefault && !exported ? "export default function" : `function f${index}`;

			exported ||= isDefault;

			return unit.replace("NAME", `f${index}`).replace("DEFAULT", keyword);
		});

		return `${named.join("\n")}\n`;
	});

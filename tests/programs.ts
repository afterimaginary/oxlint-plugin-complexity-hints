import fc from "fast-check";

/**
 * Random JSX modules for the differential fuzz test: functions built from every construct
 * the scoring spec counts or deliberately ignores, nested in each other and in closures.
 * Every program parses as a module, so a disagreement is always about scores.
 *
 * Functions only ever appear as call arguments, never directly as a ternary branch, which
 * is the one shape where scores knowingly differ from eslint-plugin-sonarjs (ADR-0002) and
 * which the branch-position fixtures pin.
 */

/** Where a statement sits, which decides the jumps it may make. */
interface Context {
	loop: boolean;
	breakable: boolean;
	/** Labels of the loops around it, in this function. */
	labels: string[];
	async: boolean;
}

/** How deep statements and expressions may nest. */
const DEPTH = 3;

const leaves = fc.constantFrom("a", "b", "c", "x.y", "f()", "f0()", "!a", "items.length", "0");

const expressions = new Map<number, fc.Arbitrary<string>>();

/** An expression, with logical chains, ternaries, closures and JSX. */
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
					fc.tuple(inner, inner, inner).map(([test, yes, no]) => `(${test} ? ${yes} : ${no})`),
					inner.map((body) => `f(() => ${body})`),
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
const fresh = (async: boolean): Context => ({
	loop: false,
	breakable: false,
	labels: [],
	async,
});

/** A brace-delimited block of up to three statements. */
function block(context: Context, depth: number): fc.Arbitrary<string> {
	return fc
		.array(statement(context, depth), { maxLength: 3 })
		.map((body) => `{\n${body.join("\n")}\n}`);
}

/** The statements that end where they start: expressions, returns and jumps. */
function simple(context: Context, depth: number): fc.Arbitrary<string> {
	const value = expression(depth);

	const jumps = [
		...(context.breakable ? ["break;"] : []),
		...(context.loop ? ["continue;"] : []),
		...context.labels.flatMap((label) => [`break ${label};`, `continue ${label};`]),
	];

	return fc.oneof(
		value.map((it) => `${it};`),
		value.map((it) => `x = ${it};`),
		value.map((it) => `x ||= ${it};`),
		value.map((it) => `x &&= ${it};`),
		value.map((it) => `return ${it};`),
		fc.constant("return;"),
		...(jumps.length > 0 ? [fc.constantFrom(...jumps)] : []),
	);
}

/** A loop of each kind, with `body` as its body. */
function loops(context: Context, depth: number, body: fc.Arbitrary<string>): fc.Arbitrary<string> {
	const test = expression(depth - 1);

	return fc.oneof(
		body.map((it) => `for (let i = 0; i < n; i++) ${it}`),
		body.map((it) => `for (const k in o) ${it}`),
		body.map((it) => `for (const v of items) ${it}`),
		...(context.async ? [body.map((it) => `for await (const v of items) ${it}`)] : []),
		fc.tuple(test, body).map(([condition, it]) => `while (${condition}) ${it}`),
		fc.tuple(body, test).map(([it, condition]) => `do ${it} while (${condition});`),
	);
}

/** A function of each kind, as a statement, with its own fresh context. */
function functions(depth: number): fc.Arbitrary<string> {
	const sync = block(fresh(false), depth - 1);
	const async = block(fresh(true), depth - 1);

	// Declarations get a block of their own, so their names can never clash.
	return fc.oneof(
		sync.map((body) => `{ function inner() ${body} }`),
		sync.map((body) => `f(() => ${body});`),
		async.map((body) => `f(async function () ${body});`),
		sync.map((body) => `(() => ${body})();`),
		sync.map((body) => `f({ m() ${body} });`),
		fc
			.tuple(sync, expression(depth - 1))
			.map(([body, value]) => `{ class K { m() ${body} field = () => ${value}; } }`),
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
	const label = `L${depth}`;
	const labeled = { ...inLoop, labels: [...context.labels, label] };

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
		loops(context, depth, block(labeled, depth - 1)).map((loop) => `${label}: ${loop}`),
		fc
			.tuple(
				test,
				fc.array(statement({ ...context, breakable: true }, depth - 1), { maxLength: 2 }),
				fc.array(statement({ ...context, breakable: true }, depth - 1), { maxLength: 2 }),
			)
			.map(
				([discriminant, first, rest]) =>
					`switch (${discriminant}) {\ncase 1:\n${first.join("\n")}\nbreak;\ndefault:\n${rest.join("\n")}\n}`,
			),
		fc
			.tuple(here, here, fc.boolean())
			.map(
				([body, handler, final]) => `try ${body} catch (e) ${handler}${final ? " finally {}" : ""}`,
			),
		here.map((body) => `try ${body} finally {}`),
		here,
		functions(depth),
	);

	statements.set(key, arbitrary);

	return arbitrary;
}

/** A module of one to three top-level functions, as a JSX source file. */
export const programs: fc.Arbitrary<string> = fc
	.array(
		fc.oneof(
			block(fresh(false), DEPTH).map((body) => `function NAME(a, b) ${body}`),
			block(fresh(true), DEPTH).map((body) => `export async function NAME() ${body}`),
			block(fresh(false), DEPTH).map((body) => `f(() => ${body});`),
		),
		{ minLength: 1, maxLength: 3 },
	)
	.map((units) => `${units.map((unit, index) => unit.replace("NAME", `f${index}`)).join("\n")}\n`);

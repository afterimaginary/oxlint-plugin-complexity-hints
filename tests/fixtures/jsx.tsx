// Conditional rendering. A `&&` (or `||`) chain directly inside a JSX expression
// container is markup, not branching, and scores nothing, unless the chain mixes
// operators or one of its operands is a ternary.

export function ShortCircuits({ a, b, c }: { a: boolean; b: boolean; c: boolean }) {
	return (
		<div>
			{a && <A />}
			{a && b && <B />}
			{a || <Fallback />}
			{a && b && c && <C />}
			<Child hidden={a && b} />
		</div>
	);
}

export function MixedOperators({ a, b, c }: { a: boolean; b: boolean; c: boolean }) {
	return (
		<div>
			{(a && b) || <Fallback />}
			{a && (b || c) && <B />}
			{(a ?? b) && <C />}
		</div>
	);
}

export function TernaryOperands({ a, b }: { a: boolean; b: boolean }) {
	return (
		<div>
			{a && (b ? <A /> : <B />)}
			{(a ? b : !b) && <C />}
		</div>
	);
}

export function NotDirectlyInContainer({ a, b }: { a: boolean; b: boolean }) {
	const banner = a && b && <Banner />;
	return (
		<div>
			{banner}
			{(a && b) as boolean}
			{render(a && b)}
			{!(a && b) && <Empty />}
			{[a && <A />]}
		</div>
	);
}

export function NestedContainers({ items, a }: { items: string[]; a: boolean }) {
	return (
		<ul>
			{a && items.map((item) => item && <li key={item}>{item.length > 1 && <Long />}</li>)}
			{a && <section>{a && <Inner />}</section>}
		</ul>
	);
}

export function InsideControlFlow({ rows, a }: { rows: string[]; a: boolean }) {
	if (a) {
		for (const row of rows) {
			if (row) {
				return <p>{a && row && <Row />}</p>;
			}
		}
	}
	return <>{a && <Empty />}</>;
}

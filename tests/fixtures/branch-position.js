// A function directly in a branch position does not change the nesting of the code
// after it. eslint-plugin-sonarjs scores these one level too deep for each such
// function; this rule reports the whitepaper totals (ADR-0002).

function ternaryBranchArrow(a) {
	const x = a ? () => a : a; // +1; the arrow scores 0
	for (;;) {} // +1, not +2
	return x;
}

function twoTernaryBranchArrows(a) {
	const x = a ? () => a : a; // +1
	const y = a ? () => a : a; // +1
	for (;;) {} // +1, not +3
	return [x, y];
}

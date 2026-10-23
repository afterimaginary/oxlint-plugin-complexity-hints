// @expect 6:10=2, 12:10=3, 19:10=5, 26:10=2, 32:10=4, 38:10=2 (see "Deviations from the whitepaper" in docs/specs/scoring.md)
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

function ternaryBranchArrowInLoop(a) {
	while (a) { // +1
		x = a ? () => { if (a) {} } : null; // +2; the arrow scores 1
		if (a) {} // +2, not +3
	}
}

function ternaryBranchFunctionExpression(a) {
	const f = a ? function () { if (a) {} } : null; // +1; the function scores 1
	for (;;) {} // +1, not +2
	return f;
}

function nestedTernaryBranchArrow(a) {
	const g = a ? (a ? () => 1 : 2) : 3; // +1, +2; the arrow scores 0
	if (a) {} // +1, not +2
	return g;
}

function asyncTernaryBranchArrow(a) {
	const h = a ? async () => 1 : null; // +1
	while (a) {} // +1, not +2
	return h;
}

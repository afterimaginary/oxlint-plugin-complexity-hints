function oneAnd(a, b) {
	return a && b; // +1
}

function andRun(a, b, c, d) {
	return a && b && c && d; // +1
}

function andOrAnd(a, b, c, d) {
	return a && b || c && d; // +1, +1
}

function orThenAnd(a, b, c) {
	return (a || b) && c; // +1
}

function parenthesizedAnd(a, b, c) {
	return a && (b && c); // +1
}

function negatedAnd(a, b, c) {
	return a && !(b && c); // +1, +1
}

function andInIf(a, b) {
	if (a && b) {} // +1, +1
}

function andInNestedIf(a, b) {
	if (a) { // +1
		if (a && b) {} // +2, +1
	}
}

function andInDefault(a = b && c) { // +1
	return a;
}

function separateChains(a, b, c, d) {
	const x = a && b; // +1
	const y = c && d; // +1
	return [x, y];
}

function andInCallArgument(a, b, c) {
	return call(a && b, c && a); // +1, +1
}

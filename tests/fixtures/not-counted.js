// Every function here scores 0 and so is never reported, except `baseline`,
// which shows that units in this file are scored.

function baseline(a) {
	if (a) {} // +1
}

function or(a, b, c) {
	return a || b || c;
}

function nullish(a, b) {
	return a ?? b;
}

function orAndNullish(a, b, c) {
	return (a || b) ?? c;
}

function logicalAssignment(a, b) {
	a &&= b;
	a ||= b;
	a ??= b;
	return a;
}

function recursion(n) {
	return recursion(n - 1);
}

function tryFinally() {
	try {
		work();
	} finally {
		done();
	}
}

function optionalChaining(a) {
	return a?.b?.c?.();
}

function earlyReturn(a) {
	return a;
}

function empty() {}

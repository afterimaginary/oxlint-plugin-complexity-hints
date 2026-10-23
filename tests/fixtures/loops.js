function forLoop(n) {
	for (let i = 0; i < n; i++) {} // +1
}

function forIn(o) {
	for (const k in o) {} // +1
}

function forOf(xs) {
	for (const x of xs) {} // +1
}

async function forAwait(xs) {
	for await (const x of xs) {} // +1
}

function whileLoop(a) {
	while (a) {} // +1
}

function doWhile(a) {
	do {} while (a); // +1
}

function nestedLoops(xs) {
	for (const x of xs) { // +1
		while (x) { // +2
			do {} while (x); // +3
		}
	}
}

function ifInLoop(xs) {
	for (const x of xs) { // +1
		if (x) {} // +2
	}
}

function ternaryInLoopHeader(a, b, c) {
	for (; a ? b : c; ) {} // +1, +1
}

function ternaryInNestedLoopTest(a, b) {
	while (a) { // +1
		while (b ? a : b) {} // +2, +2
	}
}

function onlyCatch() {
	try {
		work();
	} catch (e) { // +1
		recover(e);
	} finally {
		done();
	}
}

function ifInCatch(a) {
	try {
		work();
	} catch (e) { // +1
		if (a) {} // +2
	}
}

function catchInLoop(xs) {
	for (const x of xs) { // +1
		try {
			work(x);
		} catch (e) {} // +2
	}
}

function ternaryInCatchParam(a) {
	try {
		work();
	} catch ({ x = a ? 1 : 2 }) {} // +1, +1
}

function ifInTry(a) {
	try {
		if (a) {} // +1
	} finally {}
}

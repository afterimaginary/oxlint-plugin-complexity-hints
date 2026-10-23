// Sloppy-mode form of branch-position.js: a function declaration as the body of an
// `if` or `else`. eslint-plugin-sonarjs scores the loop one level too deep; this rule
// reports the whitepaper total (ADR-0002).

function declarationAsIfBody(a) {
	if (a) function inner() {} // +1
	for (;;) {} // +1, not +2
}

function declarationAsElseBody(a) {
	if (a) {} // +1
	else function inner() {} // +1
	for (;;) {} // +1, not +2
}

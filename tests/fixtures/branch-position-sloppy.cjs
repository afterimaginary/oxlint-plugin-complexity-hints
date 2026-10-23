// Sloppy-mode form of branch-position.js: a function declaration as the body of an
// `if`. eslint-plugin-sonarjs scores the loop one level too deep; this rule reports
// the whitepaper total (ADR-0002).

function declarationAsIfBody(a) {
	if (a) function inner() {} // +1
	for (;;) {} // +1, not +2
}

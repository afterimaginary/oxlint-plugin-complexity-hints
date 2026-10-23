// Which change the "fix" part suggests.

// The body of a top-level loop: moving it takes one nesting level off everything in it.
export function loopBody(rows) {
	for (const row of rows) {
		if (row) {
		}
		if (row) {
		}
		if (row) {
		}
	}
}

// The `else` branch carries the weight, and its own +1 stays behind.
export function elseBranch(a) {
	if (a) {
	} else {
		if (a) {
		}
		if (a) {
		}
		if (a) {
		}
		if (a) {
		}
	}
}

// A `case` of a `switch`.
export function caseBody(action) {
	switch (action.type) {
		case "add":
			if (action) {
			}
			if (action) {
			}
			if (action) {
			}
			break;
		default:
			if (action) {
			}
	}
}

// A `catch` block.
export function catchBlock(a) {
	try {
		a();
	} catch (error) {
		if (error) {
		}
		if (error) {
		}
		if (error) {
		}
	} finally {
		a();
	}
}

// A flat function splits into two runs of statements.
export function statementRun(a) {
	if (a) {
	}
	if (a) {
	}
	if (a) {
	}
	if (a) {
	}
	if (a) {
	}
	if (a) {
	}
}

// An expression-bodied arrow: a nested ternary moves into a helper.
export const ternary = (a, b, c) => (a ? (b ? (c ? 1 : 2) : 3) : 4);

// Nothing to move: a single condition.
export function condition(a, b, c, d, e) {
	return (a && b) || (c && d) || (e && a);
}

// Nothing to move: a single else-if chain with empty bodies.
export function elseIfChain(a) {
	if (a === 1) {
	} else if (a === 2) {
	} else if (a === 3) {
	} else if (a === 4) {
	}
}

// Nothing worth moving: the `if` body holds no increments, so moving it changes nothing.
export function single(a) {
	if (a) {
		a();
	}
}

// Two constructs of one kind on a line are told apart by column.
export function sameLine(a) {
	for (;;) for (;;) if (a) if (a) a();
}

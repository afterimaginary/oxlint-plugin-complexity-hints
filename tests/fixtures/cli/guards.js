// The `if` around the deepest code ends the function, so it returns early.
export function returns(order) {
	if (order) {
		for (const item of order.items) {
			if (item.ready) {
				send(item);
			}
		}
	}
}

// It ends a loop body, so it continues early, even though the loop doesn't end the function.
export function continues(items) {
	for (const item of items) {
		if (item.ready) {
			for (const part of item.parts) {
				if (part.ok) send(part);
			}
		}
	}
	done();
}

// Both `if (user)` and `if (account.active)` qualify; the outermost saves the most.
export function outermost(user, accounts) {
	if (user) {
		for (const account of accounts) {
			if (account.active) {
				for (const entry of account.entries) {
					if (entry.changed) {
						push(entry);
					}
				}
			}
		}
	}
}

// Bodies without braces end at their owner too.
export function braceless(a, xs) {
	if (a) for (const x of xs) if (x) for (const y of x) if (y) use(y);
}

// Returning early would skip `cleanup()`.
export function trailing(a, b, c) {
	if (a) {
		if (b) {
			if (c) {
				work();
			}
		}
	}
	cleanup();
}

// An `else` on the path.
export function inElse(a, b, c) {
	if (a) {
		other();
	} else {
		if (b) {
			if (c) {
				work();
			}
		}
	}
}

// An `if` with an `else` of its own.
export function hasElse(a, b, c) {
	if (a) {
		if (b) {
			if (c) {
				work();
			}
		}
	} else {
		other();
	}
}

// A `switch` on the path.
export function inCase(kind, b, c) {
	switch (kind) {
		case 1:
			if (b) {
				if (c) {
					work();
				}
			}
	}
}

// A `try` on the path.
export function inTry(a, b) {
	try {
		if (a) {
			if (b) {
				work();
			}
		}
	} catch {
		recover();
	}
}

// The deepest `if` qualifies, but nothing in its body takes a nesting bonus, so a guard saves nothing.
export function savesNothing(items) {
	for (const item of items) {
		if (item.ready) {
			send(item);
		}
	}
}

// A `&&` takes no nesting bonus, so lifting it saves nothing.
export function flatInside(order) {
	if (order) {
		for (const item of order.items) {
			if (item.ready && item.paid) send(item);
		}
	}
}

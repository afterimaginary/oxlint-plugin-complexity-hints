// How increments are grouped and ranked in the "main contributors" list.

// Increments without a nesting bonus group by kind.
export function flat(a) {
	if (a) {
	}
	if (a) {
	}
	if (a) {
	}
	if (a) {
	}
}

// Increments with one are listed one by one, heaviest first.
export function deep(a) {
	if (a) {
		for (const b of a) {
			while (b) {
				if (b) {
				}
			}
		}
	}
}

// Same kind, line and points merge; only the top three are shown.
export function mixed(a) {
	if (a) {
		a = (a ? 1 : 2) + (a ? 3 : 4);
		for (;;) {
			break;
		}
	} else if (a) {
	} else {
	}
	return a && a;
}

// `&&` chains group like other flat increments; one chain can hold two runs.
export function chains(a, b, c, d) {
	const x = a && b;
	const y = (a && b) || (c && d);
	return x && y;
}

// Labeled jumps and `for await...of`.
export async function jumps(a) {
	outer: for await (const b of a) {
		for (const c in b) {
			if (c) {
				continue outer;
			}
			continue outer;
		}
	}
}

export async function awaitLoop(a) {
	for await (const b of a) {
	}
}

// Equal points rank by first line: the `else if` group before the nested `if`.
export function ties(a) {
	if (a) {
	} else if (a) {
	} else if (a) {
	}
	for (;;) {
		if (a) {
		}
	}
}

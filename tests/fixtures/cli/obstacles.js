// Most functions put two loops in one `if` body, so moving that body is the best split,
// and end with a call that keeps a guard clause from applying.

// Returns a value on every path: return the call's result.
export function returnsAlways(xs, ys) {
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		return xs.length;
	}
	tail();
}

// Returns nothing on every path: call it, then return.
export function returnsBareAlways(xs, ys) {
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		return;
	}
	tail();
}

// Returns a value on some paths: an `if` comes back at the call site.
export function returnsSome(xs) {
	for (const x of xs) {
		if (x.ok) {
			for (const y of x.ys) if (y) log(y);
			for (const z of x.zs) if (z) log(z);
			if (x.done) return x;
		}
		tick();
	}
	tail();
}

// Returns nothing on some paths.
export function returnsBareSome(xs) {
	for (const x of xs) {
		if (x.ok) {
			for (const y of x.ys) if (y) log(y);
			for (const z of x.zs) if (z) log(z);
			if (x.done) return;
		}
		tick();
	}
	tail();
}

// Bare and valued returns on some paths: no one value tells the caller what to do.
export function returnsMixed(xs) {
	for (const x of xs) {
		if (x.ok) {
			for (const y of x.ys) if (y) log(y);
			for (const z of x.zs) if (z) log(z);
			if (x.done) return x;
			if (x.gone) return undefined;
		}
		tick();
	}
	tail();
}

// Breaks out of a loop the region doesn't own.
export function breaks(xs) {
	for (const x of xs) {
		if (x.ok) {
			for (const y of x.ys) if (y) log(y);
			for (const z of x.zs) if (z) log(z);
			if (x.last) break;
		}
		tick();
	}
	tail();
}

// Continues a loop the region doesn't own.
export function continues(xs) {
	for (const x of xs) {
		if (x.ok) {
			for (const y of x.ys) if (y) log(y);
			for (const z of x.zs) if (z) log(z);
			if (x.skip) continue;
		}
		tick();
	}
	tail();
}

// Continuing the loop whose body the region is becomes a plain `return`.
export function continuesOwnLoop(xs) {
	for (const x of xs) {
		for (const y of x.ys) if (y) log(y);
		for (const z of x.zs) if (z) log(z);
		if (x.skip) continue;
		mark(x);
	}
	tail();
}

// A labeled jump to a loop outside the region.
export function breaksToLabel(xs) {
	outer: for (const x of xs) {
		if (x.ok) {
			for (const y of x.ys) if (y) log(y);
			for (const z of x.zs) if (z) log(z);
			if (x.last) break outer;
		}
		tick();
	}
	tail();
}

// A `break` and a `continue` leaving the same region can't share one answer.
export function breaksAndContinues(xs) {
	for (const x of xs) {
		if (x.ok) {
			for (const y of x.ys) if (y) log(y);
			for (const z of x.zs) if (z) log(z);
			if (x.last) break;
			if (x.skip) continue;
		}
		tick();
	}
	tail();
}

// Jumps to a loop, `switch` or label inside the region stay inside.
export function innerJumps(xs, k) {
	if (xs) {
		for (const x of xs) {
			if (x) break;
		}
		switch (k) {
			case 1:
				log(k);
				break;
		}
		inner: for (const x of xs) {
			if (x) continue inner;
		}
	}
	tail();
}

// A `return` inside a nested function isn't one of the region's.
export function nestedReturn(xs, ys) {
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		const found = xs.find((x) => {
			return x.id;
		});
		log(found);
	}
	tail();
}

// Awaits: make the new function async.
export async function awaits(xs, ys) {
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		await save(xs);
	}
	tail();
}

// Yields: make the new function a generator.
export function* yields(xs, ys) {
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		yield xs;
	}
	tail();
}

// Reassigns a local the code after it reads.
export function reassigns(xs, ys) {
	let count = 0;
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		count = xs.length;
	}
	return count;
}

// A loop-carried value read only inside the region still has to come back.
export function loopCarried(xs) {
	let count = 0;
	for (const x of xs) {
		if (x.ok) {
			for (const y of x.ys) if (y) log(y);
			for (const z of x.zs) if (z) log(z);
			count += 1;
			log(count);
		}
		tick();
	}
	tail();
}

// A loop counter that the loop's own update reads.
export function loopCounter(xs) {
	for (let i = 0; i < xs.length; i++) {
		if (xs[i]) {
			for (const y of xs[i].ys) if (y) log(y);
			for (const z of xs[i].zs) if (z) log(z);
			i += 1;
		}
		tick();
	}
	tail();
}

// A value read only before the region, outside any loop, needn't come back.
export function readBefore(xs, ys) {
	let last = xs.at(-1);
	log(last);
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		last = ys.at(-1);
	}
	tail();
}

// A closure reads the value, wherever it sits.
export function closureReads(xs, ys) {
	let count = 0;
	const report = () => log(count);
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		count = xs.length;
	}
	report();
}

// A closure created in the region writes the value: nothing to hand back.
export function closureWrites(xs, ys, emitter) {
	let seen = 0;
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		emitter.on("seen", () => (seen = 1));
	}
	return seen;
}

// A `var` declared in an `if` body and used after the `if`: declare it before the `if`.
export function declaresVar(xs, ys) {
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		var found = xs.find(Boolean);
	}
	tail(found);
}

// A `var` declared in a case and used after the `switch`: declare it before the `switch`.
export function declaresInCase(k, xs, ys) {
	switch (k) {
		case 1:
			for (const x of xs) if (x) log(x);
			for (const y of ys) if (y) log(y);
			var label = "one";
			break;
		default:
			label = "other";
	}
	tail(label);
}

// A `var` used before the region that declares it.
export function hoisted(xs, ys) {
	log(found);
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		var found = xs.find(Boolean);
	}
	tail(found);
}

// A return together with a reassigned local needs two things handed back.
export function returnsAndReassigns(xs) {
	let count = 0;
	for (const x of xs) {
		if (x.ok) {
			for (const y of x.ys) if (y) log(y);
			for (const z of x.zs) if (z) log(z);
			if (x.done) return x;
			count += 1;
		}
		tick();
	}
	return count;
}

// A ternary's helper already returns the ternary's value, so it can't hand back `x` too.
export function ternaryAssigns(a, b, c, d) {
	let x;
	if (a) {
		if (d) return;
		log(b ? (x = c) : 3);
	}
	tail(x);
}

// Writes in a region that returns on every path are never read.
export function writesThenReturns(xs, ys) {
	let count = 0;
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		count = xs.length;
		return count;
	}
	tail(count);
}

// A `using` in a run that doesn't reach the end of the body would be disposed too early.
export function usingInRun(a, b, c, d) {
	using lock = acquire(a ? (b ? 1 : 2) : 3);
	if (c) work();
	if (d) work();
}

// The workaround's `if` counts: the inner loop's body would leave this function at 10,
// so the body of `if (account.active)` wins instead.
export function sync(accounts) {
	for (const account of accounts) {
		if (account.active) {
			for (const entry of account.entries) {
				if (entry.changed) {
					if (entry.urgent) push(entry);
				}
				if (entry.broken) return entry;
			}
		}
		log(account);
	}
}

// Breaking out of the loop whose body the region is still needs the caller to stop it.
export function breaksOwnLoop(xs) {
	for (const x of xs) {
		for (const y of x.ys) if (y) log(y);
		for (const z of x.zs) if (z) log(z);
		if (x.last) break;
		mark(x);
	}
	tail();
}

// Breaking out of the `switch` whose case the region is ends the case: a plain `return`.
export function breaksOwnSwitch(k, xs, ys) {
	switch (k) {
		case 1:
			for (const x of xs) if (x) log(x);
			for (const y of ys) if (y) log(y);
			if (xs.length) break;
			mark(k);
			break;
		default:
			mark(0);
	}
	tail();
}

// A `break` that leaves the region means it doesn't return on every path: the return and
// the break would both need handing back.
export function breaksThenReturns(xs) {
	for (const x of xs) {
		if (x.ok) {
			for (const y of x.ys) if (y) log(y);
			for (const z of x.zs) if (z) log(z);
			if (x.last) break;
			return;
		}
		tick();
	}
	tail();
}

// A `switch` that a `break` gets out of can fall off its end, so this returns on some paths.
export function switchFallsOut(xs, ys, k) {
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		switch (k) {
			case 1:
				if (xs.length) break;
				return 1;
			default:
				return 2;
		}
	}
	tail();
}

// A variable of an enclosing function: this one can run again, so the value is always read.
export function enclosing(xs, ys) {
	let total = 0;
	const add = (zs) => {
		if (zs) {
			for (const x of xs) if (x) log(x);
			for (const y of ys) if (y) log(y);
			total = zs.length;
		}
		tail();
	};
	return add;
}

// A `var` declared both in the region and before it is reassigned, not declared.
export function redeclared(xs, ys) {
	var found = null;
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		var found = xs.find(Boolean);
	}
	tail(found);
}

// The only run at the lowest score returns on some paths, which costs it a point, so a
// run one point above wins on fewer obstacles.
export function runAtNextScore(a, b, c, d) {
	if (a) log(a);
	if (b && c) return b;
	if (d) log(d);
}

// Variables scoped inside the region, even in a closure, move with it.
export function innerVariables(xs, ys) {
	if (xs) {
		for (const x of xs) if (x) log(x);
		for (const y of ys) if (y) log(y);
		xs.forEach((x) => {
			let seen = 0;
			seen += x;
			log(seen);
		});
	}
	tail();
}

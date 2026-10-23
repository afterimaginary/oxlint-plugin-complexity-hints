function labeledContinue(xs) {
	outer: for (const x of xs) { // +1
		for (const y of x) { // +2
			if (y) { // +3
				continue outer; // +1
			}
		}
	}
}

function labeledBreak() {
	outer: for (;;) { // +1
		for (;;) { // +2
			break outer; // +1
		}
	}
}

function breakOutOfLabeledBlock(a) {
	block: {
		if (a) { // +1
			break block; // +1
		}
	}
}

function unlabeledJumps(xs) {
	for (const x of xs) { // +1
		if (x) { // +2
			continue;
		}
		break;
	}
	return 0;
}

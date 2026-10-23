function onlyIf(a) {
	if (a) {} // +1
}

function ifElse(a) {
	if (a) {} else {} // +1, else +1
}

function elseIfChain(a, b, c) {
	if (a) {} // +1
	else if (b) {} // +1
	else if (c) {} // +1
	else {} // +1
}

function ifInIf(a, b) {
	if (a) { // +1
		if (b) {} // +2
	}
}

function ifInElse(a, b) {
	if (a) {} else { // +1, else +1
		if (b) {} // +2
	}
}

function ifInElseIf(a, b, c) {
	if (a) {} // +1
	else if (b) { // +1
		if (c) {} // +2
	}
}

function ifWithoutBraces(a, b) {
	if (a) if (b) b(); // +1, +2
}

function deepIf(a) {
	if (a) { // +1
		if (a) { // +2
			if (a) { // +3
				if (a) {} // +4
			}
		}
	}
}

function ternary(a) {
	return a ? 1 : 2; // +1
}

function ternaryInBranch(a, b) {
	return a ? (b ? 1 : 2) : 3; // +1, +2
}

function ternaryChain(a, b, c) {
	return a ? 1 : b ? 2 : c ? 3 : 4; // +1, +2, +3
}

function ternaryInTest(a, b) {
	return (a ? b : a) ? 1 : 2; // +1, +1
}

function ternaryInIfTest(a, b, c) {
	if (a ? b : c) {} // +1, +1
}

function ternaryInIf(a, b) {
	if (a) { // +1
		return b ? 1 : 2; // +2
	}
}

function onlySwitch(a) {
	switch (a) { // +1
		case 1:
			return "one";
		case 2:
			return "two";
		default:
			return "many";
	}
}

function ifInCase(a, b) {
	switch (a) { // +1
		case 1:
			if (b) {} // +2
	}
}

function ternaryInCaseTest(a, b) {
	switch (a) { // +1
		case b ? 1 : 2: // +2
			break;
	}
}

function ternaryInDiscriminant(a, b) {
	switch (a ? b : a) { // +1, +1
		case 1:
			break;
	}
}

function switchInIf(a, b) {
	if (a) { // +1
		switch (b) { // +2
			case 1:
				break;
		}
	}
}

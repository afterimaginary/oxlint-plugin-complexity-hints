// Code outside any function unit is not scored; class bodies and static blocks
// inside a function add to that function.

if (a) {}

const topLevelTernary = a ? 1 : 2;

class TopLevel {
	static {
		if (a) {}
	}
	field = a ? 1 : 2;
	abstractLike(): void;
	abstractLike(a?: number): void {}
}

declare function declared(a: string): void;

function overloaded(a: string): void;
function overloaded(a: number): void;
function overloaded(a: unknown) { if (a) {} } // +1

interface Shape {
	method(a: number): void;
}

function classInFunction(a) {
	class Inner {
		static {
			if (a) {} // +1 for classInFunction
		}
		field = a ? 1 : 2; // +1 for classInFunction
	}
	return Inner;
}

export default function (a) { if (a) {} } // +1

const withArrowsBefore = <T extends () => void>(f: T = (() => {}) as T): (() => void) => {
	if (f) {} // +1
	return f;
};

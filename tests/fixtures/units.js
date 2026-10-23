// Every form of function unit, each scoring 1, to pin where each is reported.

function declaration(a) { if (a) {} }

const expression = function (a) { if (a) {} };

const namedExpression = function inner(a) { if (a) {} };

const arrow = (a) => { if (a) {} };

const asyncArrow = async (a) => { if (a) {} };

const conciseArrow = (a) => a ? 1 : 2;

items.map((a) => { if (a) {} });

(function () { if (a) {} })();

function* generator(a) { if (a) {} }

class Members {
	constructor(a) { if (a) {} }
	method(a) { if (a) {} }
	static staticMethod(a) { if (a) {} }
	get getter() { if (a) {} return 1; }
	set setter(a) { if (a) {} }
	[computed](a) { if (a) {} }
	#privateMethod(a) { if (a) {} }
	fieldArrow = (a) => { if (a) {} };
	fieldFunction = function (a) { if (a) {} };
}

const literal = {
	method(a) { if (a) {} },
	property: function (a) { if (a) {} },
	namedProperty: function inner(a) { if (a) {} },
	arrowProperty: (a) => { if (a) {} },
	get getter() { if (a) {} return 1; },
};

function outer(a) {
	if (a) {} // +1 for outer only
	return (b) => {
		if (b) {} // +1 for the arrow only, at nesting 0
	};
}

function closureInBranch(a) {
	if (a) { // +1
		items.forEach((b) => {
			if (b) {} // +1 for the arrow; nesting restarts
		});
	}
}

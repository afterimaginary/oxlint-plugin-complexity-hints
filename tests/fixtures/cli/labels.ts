// How each kind of function unit is named. Every function scores 1.

export function declared(a: boolean) {
	if (a) {
	}
}

export const bound = (a: boolean) => {
	if (a) {
	}
};

const target = { nested: { f: (_: boolean) => {} } };

target.nested.f = function (a: boolean) {
	if (a) {
	}
};

target
	.nested
	// a comment inside the target
	.f = (a: boolean) => {
	if (a) {
	}
};

export class Shape {
	#hidden = (a: boolean) => {
		if (a) {
		}
	};

	field = (a: boolean) => {
		if (a) {
		}
	};

	constructor(a: boolean) {
		if (a) {
		}
	}

	method(a: boolean) {
		if (a) {
		}
	}

	get size() {
		return this.field ? 1 : 0;
	}

	[Symbol.iterator](a: boolean) {
		if (a) {
		}
	}
}

export const object = {
	method(a: boolean) {
		if (a) {
		}
	},
	property: (a: boolean) => {
		if (a) {
		}
	},
	"quoted\nkey"(a: boolean) {
		if (a) {
		}
	},
};

export default function (a: boolean) {
	if (a) {
	}
}

((a: boolean) => {
	if (a) {
	}
})(true);

[1, 2].map((a) => {
	if (a) {
	}
});

new Promise((resolve) => {
	if (resolve) {
	}
});

const handlers = [
	(a: boolean) => {
		if (a) {
		}
	},
	function named(a: boolean) {
		if (a) {
		}
	},
];

handlers[0]!((a: boolean) => {
	if (a) {
	}
});

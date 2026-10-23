// Closures and callbacks inside loops and conditionals, and deep nesting. Each
// callback is scored on its own, starting from zero nesting.

export function callbacksInLoops(groups) {
	for (const group of groups) {
		group.items.forEach((item) => {
			if (item.done) {
				return;
			}
			while (item.next) {
				item = item.next;
			}
		});
		if (group.items.some((item) => item.done && item.next)) {
			continue;
		}
	}
}

export function closureFactory(options) {
	const handlers = [];
	for (let i = 0; i < options.length; i++) {
		handlers.push(function handle(event) {
			try {
				return event.type === options[i] ? options[i] : null;
			} catch (error) {
				if (error) {
					throw error;
				}
			}
		});
	}
	return handlers;
}

export function nestedCallbacks(rows) {
	return rows.map((row) =>
		row.cells.filter((cell) => {
			if (cell) {
				return cell.values.every((value) => (value ? value > 0 : false));
			}
			return false;
		}),
	);
}

export function deepNesting(a) {
	if (a) {
		for (const b of a) {
			while (b) {
				do {
					switch (b) {
						case 1:
							try {
								if (b) {
									for (;;) {
										b = b ? b : a;
									}
								}
							} catch {
								break;
							}
					}
				} while (a);
			}
		}
	}
}

export async function asyncLoop(urls) {
	for await (const url of urls) {
		await Promise.all(
			url.parts.map(async (part) => {
				if (part) {
					for (const chunk of part) {
						if (chunk) {
							continue;
						}
					}
				}
			}),
		);
	}
}

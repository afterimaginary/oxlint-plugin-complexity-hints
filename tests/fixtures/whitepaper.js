// Worked examples from the SonarSource Cognitive Complexity whitepaper, translated to
// JavaScript. getWords, sumOfPrimes, myMethod and overriddenSymbolFrom score exactly
// the whitepaper totals. The others differ only by the deviations in ADR-0002:
// - myMethod2: the arrow is scored on its own (1) and the outer function scores 0,
//   where the whitepaper scores the outer function 2.
// - toRegexp: `||` is not counted, so 19 instead of 20.
// - model.save: `||` is not counted and each nested function is scored on its own,
//   so save 1, the _validate callback 3 and the sync callback 7, instead of 20 for save.
// addVersion is left out: it relies on Java multi-catch, which JavaScript cannot express.

function getWords(number) {
	switch (number) {
		case 1:
			return "one";
		case 2:
			return "a couple";
		case 3:
			return "a few";
		default:
			return "lots";
	}
}

function sumOfPrimes(max) {
	let total = 0;
	OUT: for (let i = 1; i <= max; ++i) {
		for (let j = 2; j < i; ++j) {
			if (i % j === 0) {
				continue OUT;
			}
		}
		total += i;
	}
	return total;
}

function myMethod() {
	try {
		if (condition1) {
			for (let i = 0; i < 10; i++) {
				while (condition2) {
					work();
				}
			}
		}
	} catch (e) {
		if (condition2) {
			work();
		}
	}
}

function myMethod2() {
	const r = () => {
		if (condition1) {
			work();
		}
	};
	return r;
}

function overriddenSymbolFrom(classType) {
	if (classType.isUnknown()) {
		return Symbols.unknownMethodSymbol;
	}
	let unknownFound = false;
	const symbols = classType.getSymbol().members().lookup(name);
	for (const overrideSymbol of symbols) {
		if (overrideSymbol.isKind(JavaSymbol.MTH) && !overrideSymbol.isStatic()) {
			const methodJavaSymbol = overrideSymbol;
			if (canOverride(methodJavaSymbol)) {
				const overriding = checkOverridingParameters(methodJavaSymbol, classType);
				if (overriding === null) {
					if (!unknownFound) {
						unknownFound = true;
					}
				} else if (overriding) {
					return methodJavaSymbol;
				}
			}
		}
	}
	if (unknownFound) {
		return Symbols.unknownMethodSymbol;
	}
	return null;
}

function toRegexp(antPattern, directorySeparator) {
	const escapedDirectorySeparator = "\\" + directorySeparator;
	const sb = [];
	sb.push("^");
	let i = antPattern.startsWith("/") || antPattern.startsWith("\\") ? 1 : 0;
	while (i < antPattern.length) {
		const ch = antPattern.charAt(i);
		if (SPECIAL_CHARS.indexOf(ch) !== -1) {
			sb.push("\\", ch);
		} else if (ch === "*") {
			if (i + 1 < antPattern.length && antPattern.charAt(i + 1) === "*") {
				if (i + 2 < antPattern.length && isSlash(antPattern.charAt(i + 2))) {
					sb.push("(?:.*", escapedDirectorySeparator, "|)");
					i += 2;
				} else {
					sb.push(".*");
					i += 1;
				}
			} else {
				sb.push("[^", escapedDirectorySeparator, "]*?");
			}
		} else if (ch === "?") {
			sb.push("[^", escapedDirectorySeparator, "]");
		} else if (isSlash(ch)) {
			sb.push(escapedDirectorySeparator);
		} else {
			sb.push(ch);
		}
		i++;
	}
	sb.push("$");
	return sb.join("");
}

const model = {
	save: function (options, callback) {
		var self = this;
		if (typeof options === "function") {
			callback = options;
			options = {};
		}
		options || (options = {});
		self._validate(self.toJSON(), function (err) {
			if (err) {
				callback && callback.call(null, err);
				return;
			}
			self.sync(self.isNew() ? "create" : "update", options, function (err, response) {
				var facade = { options: options, response: response },
					parsed;
				if (err) {
					facade.error = err;
					facade.src = "save";
					self.fire(EVT_ERROR, facade);
				} else {
					if (!self._saveEvent) {
						self._saveEvent = self.publish(EVT_SAVE, { preventable: false });
					}
					if (response) {
						parsed = facade.parsed = self._parse(response);
						self.setAttrs(parsed, options);
					}
					self.changed = {};
					self.fire(EVT_SAVE, facade);
				}
				callback && callback.apply(null, arguments);
			});
		});
		return self;
	},
};

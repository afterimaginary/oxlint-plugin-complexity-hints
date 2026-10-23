import type { Location, SourceCode } from "@oxlint/plugins";
import type { FunctionUnit } from "./scoring.ts";

/** Where a unit's diagnostic points: see "Report location" in docs/specs/scoring.md. */
export function reportLocation(unit: FunctionUnit, sourceCode: SourceCode): Location {
	if (unit.type === "ArrowFunctionExpression") {
		// Searching back from the body finds the arrow's own `=>` before any `=>`
		// in its parameters, defaults, type parameters or return type.
		const arrow = sourceCode.getTokenBefore(unit.body, { filter: (token) => token.value === "=>" });

		return (arrow ?? unit).loc;
	}

	if (unit.type === "FunctionDeclaration" && unit.id) {
		return unit.id.loc;
	}

	const parent = unit.parent;

	if ((parent.type === "MethodDefinition" || parent.type === "Property") && parent.value === unit) {
		return parent.key.loc;
	}

	const keyword = sourceCode.getFirstToken(unit, { filter: (token) => token.value === "function" });

	return (keyword ?? unit).loc;
}

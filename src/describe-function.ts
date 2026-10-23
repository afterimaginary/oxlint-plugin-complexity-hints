import type { ESTree } from "@oxlint/plugins";
import type { FunctionUnit } from "./scoring.ts";

/** A property key as written, or `[computed]` when it is an expression. */
function keyName(key: ESTree.Node, computed: boolean): string {
	if (!computed) {
		if (key.type === "Identifier") {
			return key.name;
		}

		if (key.type === "PrivateIdentifier") {
			return `#${key.name}`;
		}

		if (key.type === "Literal") {
			return String(key.value);
		}
	}

	return "[computed]";
}

/** `a.b.c` for an assignment target, with `[computed]` for any part that is an expression. */
function targetName(target: ESTree.Node): string {
	if (target.type === "Identifier") {
		return target.name;
	}

	if (target.type === "ThisExpression") {
		return "this";
	}

	if (target.type === "MemberExpression") {
		const property = target.computed ? "[computed]" : `.${keyName(target.property, false)}`;

		return `${targetName(target.object)}${property}`;
	}

	return "[computed]";
}

/** The last name of a callee: `items.map` gives `map`. */
function calleeName(callee: ESTree.Node): string | undefined {
	if (callee.type === "Identifier") {
		return callee.name;
	}

	if (callee.type === "MemberExpression" && !callee.computed) {
		return keyName(callee.property, false);
	}

	return undefined;
}

/** A method, accessor or class field, or an object property holding the function. */
function memberLabel(unit: FunctionUnit, parent: ESTree.Node): string | undefined {
	if (parent.type === "MethodDefinition" && parent.value === unit) {
		return parent.kind === "constructor"
			? "Method 'constructor'"
			: `Method '${keyName(parent.key, parent.computed)}'`;
	}

	if (
		(parent.type === "PropertyDefinition" || parent.type === "AccessorProperty") &&
		parent.value === unit
	) {
		return `Method '${keyName(parent.key, parent.computed)}'`;
	}

	if (parent.type === "Property" && parent.value === unit) {
		const kind = parent.method || parent.kind !== "init" ? "Method" : "Function";

		return `${kind} '${keyName(parent.key, parent.computed)}'`;
	}

	return undefined;
}

/** A function bound to a variable or assigned to a target. */
function bindingLabel(unit: FunctionUnit, parent: ESTree.Node): string | undefined {
	if (
		parent.type === "VariableDeclarator" &&
		parent.init === unit &&
		parent.id.type === "Identifier"
	) {
		return `Function '${parent.id.name}'`;
	}

	if (parent.type === "AssignmentExpression" && parent.right === unit) {
		return `Function '${targetName(parent.left)}'`;
	}

	return undefined;
}

/** A default export, an immediately invoked function or a callback. */
function contextLabel(unit: FunctionUnit, parent: ESTree.Node): string | undefined {
	if (parent.type === "ExportDefaultDeclaration") {
		return "Default export function";
	}

	if (parent.type !== "CallExpression" && parent.type !== "NewExpression") {
		return undefined;
	}

	if (parent.callee === unit) {
		return "Immediately invoked function";
	}

	const callee = calleeName(parent.callee);

	return callee ? `Callback passed to '${callee}'` : "Callback";
}

function label(unit: FunctionUnit): string {
	if (unit.type === "FunctionDeclaration" && unit.id) {
		return `Function '${unit.id.name}'`;
	}

	const found =
		memberLabel(unit, unit.parent) ??
		bindingLabel(unit, unit.parent) ??
		contextLabel(unit, unit.parent);

	if (found) {
		return found;
	}

	return unit.type === "FunctionExpression" && unit.id
		? `Function '${unit.id.name}'`
		: "Anonymous function";
}

/**
 * How a diagnostic names a unit, so an agent can find it again: see "Function label"
 * in docs/specs/diagnostics.md. Whitespace runs collapse to one space, so a name can
 * never break the diagnostic across lines.
 */
export function describeFunction(unit: FunctionUnit): string {
	return label(unit).replaceAll(/\s+/g, " ");
}

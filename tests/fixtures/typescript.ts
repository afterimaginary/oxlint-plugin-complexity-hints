// TypeScript-only syntax. Type-level constructs add nothing and create no function
// units; type assertions and annotations don't change how an expression scores.

export function assertions(a: unknown, b: unknown, c: unknown) {
	if ((a as boolean) && (b satisfies unknown) && c!) {
		return <string>a;
	}
	const d = (a as boolean)! ? b : c;
	return d;
}

// A type wrapper around a sub-chain ends the chain, as any non-logical operand does,
// so each line scores 2.
export function wrappedChains(a: boolean, b: boolean, c: boolean) {
	const x = a && ((b && c) as boolean);
	const y = a && (b && c)!;
	const z = a && ((b && c) satisfies boolean);
	return [x, y, z];
}

export function annotations(
	a: boolean | undefined,
	b: (x: number) => x is 1,
	c: { m(): void; f: () => boolean },
): a is true {
	let t: typeof a extends true ? 1 : 2;
	type Local<T> = T extends string ? (T extends "a" ? 1 : 2) : 3;
	interface Shape {
		area(): number;
		get size(): number;
	}
	return a === true;
}

export function overloads(a: string): string;
export function overloads(a: number): number;
export function overloads(a: string | number) {
	return typeof a === "string" ? a : a + 1;
}

export class Members {
	constructor(
		private readonly a: boolean,
		public b = a ? 1 : 2,
	) {
		if (a) {
		}
	}

	declare c: number;
	d!: string;

	method(a: string): void;
	method(a: number): void;
	method(a: unknown) {
		for (const x of [a]) {
			if (x) {
			}
		}
	}

	get value(): number {
		return this.a ? 1 : 0;
	}
}

export abstract class Shape {
	abstract area(): number;
	protected abstract readonly sides: number;
	describe() {
		return this.sides > 2 ? "polygon" : "line";
	}
}

export enum Color {
	Red = 1,
	Green = Red ? 2 : 3,
}

export const enum Flags {
	A = 1 << 0,
	B = 1 << 1,
}

export namespace Geometry {
	export const origin = { x: 0, y: 0 };
	export function distance(a: number, b: number) {
		return a > b ? a - b : b - a;
	}
	export namespace Inner {
		export const f = (a: boolean) => {
			if (a) {
			}
		};
	}
}

declare function external(a: boolean): void;
declare const config: { flag: boolean };
declare class Ambient {
	method(a: boolean): void;
}
declare module "virtual" {
	export function load(a: string): Promise<string>;
}
declare global {
	interface Window {
		check(a: boolean): void;
	}
}

export function generics<T extends object, K extends keyof T>(obj: T, key: K): T[K] | undefined {
	return key in obj ? obj[key] : undefined;
}

export function containsTypeOnlyDeclarations(a: boolean) {
	enum Local {
		X = 1,
	}
	type Pair = [boolean, boolean];
	if (a) {
	}
	return [Local.X] as unknown as Pair;
}

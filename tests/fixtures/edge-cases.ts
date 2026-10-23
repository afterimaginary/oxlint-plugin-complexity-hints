// TypeScript-only syntax: abstract and declared members, parameter properties,
// decorators, accessors, namespaces, overloads, enums, generics and type operators.

abstract class A {
  abstract m(a: number): void;
  m2(a = b ? 1 : 2): void {}
  declare x: number;
  constructor(private readonly p = a ? 1 : 2) { }
  @dec(a ? 1 : 2) m3() { if (a) {} }
  accessor acc = () => { if (a) {} };
  static #s = function () { if (a) {} };
  async *gen() { for await (const x of y) {} }
  'str'(a) { if (a) {} }
  42(a) { if (a) {} }
}
namespace N { export function f(a) { if (a) {} } }
const o = {
  async m(a) { if (a) {} },
  async: async function (a) { if (a) {} },
  [`t${a ? 1 : 2}`]: () => { if (a) {} },
  get g() { return a ? 1 : 2; },
};
const af = async function (a) { if (a) {} };
export default (a) => { if (a) {} };
const t = <T,>(a: T): T => { if (a) {} return a; };
const u = (a = () => b ? 1 : 2) => { if (a) {} };
function g(this: X, a) { if (a satisfies B) {} if ((a as any)!) {} }
type Q<T> = T extends string ? 1 : 2;
function e() { enum E { A = a ? 1 : 2 } }
function outer(a) {
  abstract class K {
    abstract m(x = a ? 1 : 2): void;
  }
  function ov(x = a ? 1 : 2): void;
  function ov(x) {}
  if (a) {}
}

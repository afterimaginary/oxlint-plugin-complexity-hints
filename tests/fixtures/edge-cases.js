// Assorted shapes found in review: parameter defaults, computed keys, labels,
// mixed logical operators, chained `else if`, and every kind of function unit.

function p1(a = b ? 1 : 2) { if (a) {} }
function p2(a) { for (const x of a ? b : c) {} }
function p3(a) { do {} while (a ? b : c); }
function p4(a) { switch (a) { case b ? 1 : 2: break; } }
function p5(a) { try {} catch ({ x = a ? 1 : 2 }) {} }
function p6(a) { class A { [a ? 'x' : 'y']() {} } }
function p7(a) { if (a) { class A { x = a ? 1 : 2; static { if (a) {} } } } }
function p8(a) { return a && b && (c || d) && e; }
function p9(a) { return a && (b ?? c) && d; }
function p10(a) { return (a && b) ?? (c && d); }
function p12(a) { for (;;) { label: for (;;) { continue label; } } }
function p14(a) { x = !(a && b) && c; }
function p15(a) { if (a) {} else if (b) {} else { if (c) {} } }
function p16(a) { a?.b && c?.d; a &&= b && c; }
function p17(a) { if (a) { label: { break label; } } }
function p18(a) { const o = { get [a ? 'x' : 'y']() { return 1; } }; }
function p19(a) { for (let i = a ? 1 : 2; i < (b ? 1 : 2); i += c ? 1 : 2) { if (a) {} } }
function p20(a) { if (a) { (() => { if (b) {} })(); if (c) {} } }
function p22(a) { if (a ? b : c) {} }
function p23(a) { x = `${a ? 1 : 2}`; y = (a && b, c && d); }
function p24(a) { if (a) { function inner() {} if (b) {} } }
function p25(a) { switch (a) { case 1: if (b) {} default: { for (;;) {} } } }
function p26(a) { if (a) { class C { m() { if (b) {} } } if (c) {} } }
function p27(a) { if (a) { const o = { m() { if (b) {} } }; if (c) {} } }
function p29(a) { for (;;) { const h = () => 1; if (c) {} } }
function p30(a) { if (a) {} else (() => { if (b) {} })(); if (c) {} }
function q1(a) { return a && (b ? c && d : e); }
function q2(a) { return a && b ? c : d && e; }
const q3 = a => b => { if (a) {} };
const q4 = (a = "=>", b = `=>`, c = /=>/) /* => */ => { if (a) {} };
const C = class { m(a) { if (a) {} } };
function q5(a) { if (a) { if (b) {} else if (c) {} else {} } }
function q6(a) { outer: while (a) { switch (b) { case 1: break outer; default: continue outer; } } }
function q7(a) { try { if (a) {} } catch { try {} catch (e) { if (b) {} } } finally { if (c) {} } }
function q8(a) { for (const k in a) { for (const v of a[k]) { while (v) { do { if (a) {} } while (b); } } } }
function q9(a) { return a ? b : c ? d : e ? f : g; }
function q10(a) { x = (a && b && c || d && e) ?? f; }
function q11(a) { if (a) {} else if (b) {} else if (c) {} }
function q12(a) { if (a) return; else return; }
function q13(a) { if (a) if (b) if (c) {} }
function q14(a) { while (a) if (b) {} else if (c) {} else for (;;) {} }
new Promise(function (resolve) { if (a) {} });
export function q15(a) { if (a) {} }
export default function (a) { if (a) {} }

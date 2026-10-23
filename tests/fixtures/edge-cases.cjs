// Sloppy-mode shapes that eslint-plugin-sonarjs scores the same way as this rule.

function labeledDeclaration(a) { l: function g() { if (a) {} } for (;;) {} }
function ternaryBranchClass(a) { x = a ? class { m() {} } : null; for (;;) {} }

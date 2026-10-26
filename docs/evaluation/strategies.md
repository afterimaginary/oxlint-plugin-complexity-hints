# Hint strategies, simulated

How many rounds of the lint loop each hint strategy takes to bring a function to the max, and what it adds along the way. `scripts/simulate-hints.mjs` takes every function over the default max of 15 in the repositories of the [hint evaluation](hints.md). It plays the loop without an agent: it applies the function's hint mechanically, as the hint evaluation does, lints again, and repeats. It stops when the function and every function moved out of it are at or under the max, or one of them has no concrete hint. Each function is followed in a copy of its file of its own, and each step is checked against the scores its hint promised.

This measures what it costs to reach the max, not how reviewable the result is: a change that moves code is harder to review than one that doesn't, which the line counts below only approximate.

## Strategies

Each strategy decides between the guard clause the rule finds and the best region to move, when both help. The rule finds at most one guard clause, around the deepest increment, so the strategies compare that guard against every move, not every possible guard.

- **Guard first**: the guard clause.
- **Largest saving**: whichever leaves the lower highest score; a tie goes to the guard clause, which moves no code.
- **Guard if enough**, what the rule does: the guard clause when it brings the function to the max, or else as largest saving.

A strategy that adds how far over the max the function still is would pick the same fix as largest saving, differing only in wording. A mechanical loop doesn't read the wording, so only an agent could tell them apart; the [agent pilot](agent-pilot.md) didn't test it.

## Outcomes

| Outcome                      | Guard first | Largest saving | Guard if enough |
| ---------------------------- | ----------: | -------------: | --------------: |
| at or under the max          |         300 |            301 |             301 |
| stuck: no concrete hint      |          19 |             18 |              18 |
| rewrite failed (not counted) |           0 |              0 |               0 |
| stopped at 100 edits         |           0 |              0 |               0 |
| **all**                      |         319 |            319 |             319 |

## Cost of reaching the max

Over the 300 functions that every strategy brings to the max:

| Over 300 functions                               | Guard first | Largest saving | Guard if enough |
| ------------------------------------------------ | ----------: | -------------: | --------------: |
| Edits (hints applied), total                     |         607 |            552 |             552 |
| Edits, median / 90th percentile / max            |  1 / 4 / 13 |     1 / 3 / 11 |      1 / 3 / 11 |
| Lint rounds, total                               |         532 |            477 |             477 |
| Lint rounds, median / 90th percentile / max      |  1 / 3 / 11 |     1 / 3 / 11 |      1 / 3 / 11 |
| Functions added                                  |         529 |            551 |             538 |
| Lines moved into new functions                   |       23455 |          24116 |           23752 |
| Lines moved, including up a level out of a guard |       26695 |          24484 |           24552 |
| Net new lines                                    |       +1675 |          +1843 |           +1783 |
| Highest score left, median / max                 |     12 / 15 |        11 / 15 |         12 / 15 |

- **Edits** count hints applied, one at a time, to the highest-scoring function still over the max.
- **Lint rounds** count runs of the linter an agent would see. Every function over the max is reported in each run, so a function moved out in one round gets its own fix in the next, alongside the one it came from. Each function's hints are taken to depend only on its own code, which holds unless a move hands variables back and forth between them.
- **Lines moved** count every line of each region moved into a new function, blank ones included, and, in the second row, the lines a guard clause's body moves up a level as well, which a formatter re-indents.
- **Net new lines** count non-blank lines added, as the rewrites lay them out: a call and its workaround where the region was, and the new function's first and last lines.

## Where the strategies differ

The strategies part on 64 of 319 functions, each time where guard first suggests a guard clause and another strategy a move:

- **Largest saving** parts from it on 64, and on 10 of them passes over a guard clause that alone would have reached the max.
- **Guard if enough** parts from it on 54, and on 0 of them passes over a guard clause that alone would have reached the max.

Over the 58 of those that every strategy brings to the max:

| Over 58 functions                                | Guard first | Largest saving | Guard if enough |
| ------------------------------------------------ | ----------: | -------------: | --------------: |
| Edits (hints applied), total                     |         172 |            117 |             117 |
| Edits, median / 90th percentile / max            |  2 / 6 / 13 |     1 / 5 / 11 |      1 / 5 / 11 |
| Lint rounds, total                               |         144 |             89 |              89 |
| Lint rounds, median / 90th percentile / max      |   2 / 4 / 9 |      1 / 3 / 5 |       1 / 3 / 5 |
| Functions added                                  |          95 |            117 |             104 |
| Lines moved into new functions                   |        5652 |           6313 |            5949 |
| Lines moved, including up a level out of a guard |        8524 |           6313 |            6381 |
| Net new lines                                    |        +223 |           +391 |            +331 |
| Highest score left, median / max                 |     12 / 15 |        11 / 15 |         12 / 15 |

| Against guard first: fewer / same / more | Largest saving | Guard if enough |
| ---------------------------------------- | -------------: | --------------: |
| Lint rounds                              |    43 / 15 / 0 |     43 / 15 / 0 |
| Edits                                    |    43 / 15 / 0 |     43 / 15 / 0 |
| Functions added                          |    2 / 32 / 24 |     3 / 42 / 13 |
| Lines moved, including out of a guard    |     50 / 7 / 1 |     46 / 12 / 0 |
| Highest score left                       |   20 / 17 / 21 |    11 / 26 / 21 |

## The strategy the rule uses

The rule uses guard if enough (ADR-0005). The [agent pilot](agent-pilot.md) gives no reason to keep suggesting a guard clause that isn't enough on its own: given one, agents extracted functions anyway. Where the strategies part, it reaches the max in fewer lint rounds than guard first on 43 of 58 functions, and never in more: 89 rounds against 144. Guard first still moves 5652 lines into new functions after its guard clauses, against 5949, so suggesting the move straight away mostly saves the rounds the guard clauses took.

Against largest saving, it reaches the max in as few edits and lint rounds, and adds 104 functions to 117, because it keeps the guard clause wherever the guard alone is enough. Whether that smaller change is also easier to review would take an agent benchmark on harder tasks than the pilot's (#53).

What it costs, against guard first over these 58: 9 more functions, and the moved code a reader follows into them. Its highest score left is higher than guard first's on 21 of them and lower on 11, though at or under the max either way. The simulation can't weigh these against a round saved; an agent in the loop could, by how many tokens and steps it takes and how large its diff is, but the pilot's agents fixed every function in one pass.

## Not counted

No rewrite failed to parse or to reach its promised scores.

## Every function where the strategies differ

- ESLint `lib/linter/apply-disable-directives.js:306`, 20: guard first 2 edits, 2 rounds, 1 added, 10 left; largest saving 1 edits, 1 rounds, 1 added, 11 left; guard if enough 1 edits, 1 rounds, 1 added, 11 left
- ESLint `lib/rule-tester/rule-tester.js:947`, 102: guard first 6 edits, 4 rounds, 4 added, 15 left; largest saving 5 edits, 3 rounds, 5 added, 14 left; guard if enough 5 edits, 3 rounds, 4 added, 15 left
- ESLint `lib/rules/accessor-pairs.js:232`, 41: guard first 3 edits, 3 rounds, 1 added, 14 left; largest saving 1 edits, 1 rounds, 1 added, 15 left; guard if enough 1 edits, 1 rounds, 1 added, 15 left
- ESLint `lib/rules/for-direction.js:106`, 29: guard first 2 edits, 2 rounds, 1 added, 13 left; largest saving 1 edits, 1 rounds, 1 added, 13 left; guard if enough 1 edits, 1 rounds, 1 added, 13 left
- ESLint `lib/rules/grouped-accessor-pairs.js:147`, 51: guard first 4 edits, 4 rounds, 1 added, 15 left; largest saving 2 edits, 2 rounds, 2 added, 15 left; guard if enough 2 edits, 2 rounds, 2 added, 15 left
- ESLint `lib/rules/key-spacing.js:442`, 35: guard first 2 edits, 2 rounds, 1 added, 12 left; largest saving 2 edits, 2 rounds, 2 added, 10 left; guard if enough 2 edits, 2 rounds, 2 added, 10 left
- ESLint `lib/rules/no-duplicate-imports.js:141`, 22: guard first 1 edits, 1 rounds, 0 added, 15 left; largest saving 1 edits, 1 rounds, 1 added, 12 left; guard if enough 1 edits, 1 rounds, 0 added, 15 left
- ESLint `lib/rules/no-implicit-globals.js:86`, 20: guard first 2 edits, 2 rounds, 1 added, 9 left; largest saving 1 edits, 1 rounds, 1 added, 9 left; guard if enough 1 edits, 1 rounds, 1 added, 9 left
- ESLint `lib/rules/no-misleading-character-class.js:170`, 16: guard first 1 edits, 1 rounds, 0 added, 14 left; largest saving 1 edits, 1 rounds, 1 added, 7 left; guard if enough 1 edits, 1 rounds, 0 added, 14 left
- ESLint `lib/rules/no-restricted-exports.js:109`, 23: guard first 2 edits, 2 rounds, 1 added, 9 left; largest saving 1 edits, 1 rounds, 1 added, 12 left; guard if enough 1 edits, 1 rounds, 1 added, 12 left
- ESLint `lib/rules/no-restricted-imports.js:505`, 18: guard first 2 edits, 2 rounds, 1 added, 7 left; largest saving 1 edits, 1 rounds, 1 added, 8 left; guard if enough 1 edits, 1 rounds, 1 added, 8 left
- ESLint `lib/rules/no-useless-assignment.js:230`, 23: guard first 2 edits, 2 rounds, 1 added, 13 left; largest saving 1 edits, 1 rounds, 1 added, 14 left; guard if enough 1 edits, 1 rounds, 1 added, 14 left
- ESLint `lib/rules/prefer-const.js:381`, 43: guard first 2 edits, 2 rounds, 1 added, 14 left; largest saving 2 edits, 2 rounds, 2 added, 15 left; guard if enough 2 edits, 2 rounds, 2 added, 15 left
- ESLint `lib/rules/semi-spacing.js:140`, 25: guard first 2 edits, 2 rounds, 0 added, 15 left; largest saving 1 edits, 1 rounds, 1 added, 13 left; guard if enough 1 edits, 1 rounds, 1 added, 13 left
- ESLint `lib/rules/use-isnan.js:177`, 16: guard first 1 edits, 1 rounds, 0 added, 12 left; largest saving 1 edits, 1 rounds, 1 added, 6 left; guard if enough 1 edits, 1 rounds, 0 added, 12 left
- ESLint `lib/rules/valid-typeof.js:90`, 26: guard first 2 edits, 2 rounds, 0 added, 15 left; largest saving 1 edits, 1 rounds, 1 added, 12 left; guard if enough 1 edits, 1 rounds, 1 added, 12 left
- ESLint `lib/shared/serialization.js:32`, 20: guard first 3 edits, 3 rounds, 1 added, 7 left; largest saving 1 edits, 1 rounds, 1 added, 8 left; guard if enough 1 edits, 1 rounds, 1 added, 8 left
- Prettier `src/cli/format.js:285`, 79: guard first stuck after 6 edits; largest saving stuck after 6 edits; guard if enough stuck after 6 edits
- Prettier `src/document/debug.js:71`, 62: guard first 7 edits, 4 rounds, 5 added, 14 left; largest saving 7 edits, 3 rounds, 7 added, 9 left; guard if enough 7 edits, 3 rounds, 6 added, 11 left
- Prettier `src/language-css/parser-postcss.js:23`, 170: guard first 13 edits, 9 rounds, 11 added, 14 left; largest saving 9 edits, 5 rounds, 9 added, 15 left; guard if enough 9 edits, 5 rounds, 9 added, 15 left
- Prettier `src/language-css/printer-postcss.js:53`, 259: guard first stuck after 24 edits; largest saving stuck after 23 edits; guard if enough stuck after 23 edits
- Prettier `src/language-html/ast.js:42`, 16: guard first 1 edits, 1 rounds, 0 added, 14 left; largest saving 1 edits, 1 rounds, 1 added, 7 left; guard if enough 1 edits, 1 rounds, 0 added, 14 left
- Prettier `src/language-html/print/children.js:139`, 30: guard first 2 edits, 2 rounds, 1 added, 14 left; largest saving 2 edits, 2 rounds, 2 added, 13 left; guard if enough 2 edits, 2 rounds, 1 added, 14 left
- Prettier `src/language-js/clean.js:26`, 53: guard first 4 edits, 3 rounds, 3 added, 14 left; largest saving 3 edits, 2 rounds, 3 added, 14 left; guard if enough 3 edits, 2 rounds, 3 added, 14 left
- Prettier `src/language-js/comments/handle-comments.js:383`, 28: guard first 2 edits, 2 rounds, 1 added, 12 left; largest saving 1 edits, 1 rounds, 1 added, 12 left; guard if enough 1 edits, 1 rounds, 1 added, 12 left
- Prettier `src/language-js/needs-parens.js:20`, 240: guard first stuck after 34 edits; largest saving stuck after 34 edits; guard if enough stuck after 34 edits
- Vite `packages/vite/src/node/logger.ts:104`, 17: guard first 1 edits, 1 rounds, 0 added, 12 left; largest saving 1 edits, 1 rounds, 1 added, 8 left; guard if enough 1 edits, 1 rounds, 0 added, 12 left
- Vite `packages/vite/src/node/optimizer/index.ts:834`, 22: guard first 2 edits, 2 rounds, 0 added, 14 left; largest saving 1 edits, 1 rounds, 1 added, 8 left; guard if enough 1 edits, 1 rounds, 1 added, 8 left
- Vite `packages/vite/src/node/optimizer/resolve.ts:46`, 21: guard first 2 edits, 2 rounds, 1 added, 8 left; largest saving 1 edits, 1 rounds, 1 added, 8 left; guard if enough 1 edits, 1 rounds, 1 added, 8 left
- Vite `packages/vite/src/node/plugins/css.ts:895`, 26: guard first 2 edits, 2 rounds, 1 added, 13 left; largest saving 1 edits, 1 rounds, 1 added, 13 left; guard if enough 1 edits, 1 rounds, 1 added, 13 left
- Vite `packages/vite/src/node/plugins/importAnalysisBuild.ts:219`, 38: guard first 4 edits, 3 rounds, 3 added, 8 left; largest saving 3 edits, 2 rounds, 3 added, 9 left; guard if enough 3 edits, 2 rounds, 3 added, 9 left
- Vite `packages/vite/src/node/plugins/importAnalysisBuild.ts:401`, 182: guard first 8 edits, 6 rounds, 5 added, 14 left; largest saving 6 edits, 3 rounds, 6 added, 15 left; guard if enough 6 edits, 3 rounds, 6 added, 15 left
- Vite `packages/vite/src/node/plugins/optimizedDeps.ts:32`, 24: guard first 2 edits, 2 rounds, 1 added, 6 left; largest saving 1 edits, 1 rounds, 1 added, 10 left; guard if enough 1 edits, 1 rounds, 1 added, 10 left
- Vite `packages/vite/src/node/plugins/preAlias.ts:28`, 22: guard first 2 edits, 2 rounds, 0 added, 13 left; largest saving 1 edits, 1 rounds, 1 added, 9 left; guard if enough 1 edits, 1 rounds, 1 added, 9 left
- Vite `packages/vite/src/node/plugins/resolve.ts:196`, 101: guard first stuck after 7 edits; largest saving stuck after 6 edits; guard if enough stuck after 6 edits
- Vite `packages/vite/src/node/plugins/resolve.ts:1072`, 32: guard first 2 edits, 2 rounds, 1 added, 10 left; largest saving 1 edits, 1 rounds, 1 added, 12 left; guard if enough 1 edits, 1 rounds, 1 added, 12 left
- Vite `packages/vite/src/node/plugins/splitVendorChunk.ts:112`, 18: guard first 2 edits, 2 rounds, 1 added, 6 left; largest saving 1 edits, 1 rounds, 1 added, 7 left; guard if enough 1 edits, 1 rounds, 1 added, 7 left
- Vite `packages/vite/src/node/plugins/workerImportMetaUrl.ts:129`, 28: guard first 2 edits, 2 rounds, 1 added, 12 left; largest saving 1 edits, 1 rounds, 1 added, 12 left; guard if enough 1 edits, 1 rounds, 1 added, 12 left
- Vite `packages/vite/src/node/server/hmr.ts:374`, 40: guard first 4 edits, 3 rounds, 3 added, 9 left; largest saving 3 edits, 2 rounds, 3 added, 9 left; guard if enough 3 edits, 2 rounds, 3 added, 9 left
- Vite `packages/vite/src/node/server/middlewares/proxy.ts:161`, 20: guard first 2 edits, 2 rounds, 0 added, 13 left; largest saving 1 edits, 1 rounds, 1 added, 6 left; guard if enough 1 edits, 1 rounds, 1 added, 6 left
- Vite `packages/vite/src/node/server/mixedModuleGraph.ts:644`, 21: guard first 2 edits, 2 rounds, 1 added, 5 left; largest saving 1 edits, 1 rounds, 1 added, 8 left; guard if enough 1 edits, 1 rounds, 1 added, 8 left
- Vite `packages/vite/src/node/server/transformRequest.ts:234`, 77: guard first 8 edits, 4 rounds, 7 added, 14 left; largest saving 7 edits, 4 rounds, 7 added, 14 left; guard if enough 7 edits, 4 rounds, 6 added, 14 left
- Vite `packages/vite/src/node/ssr/ssrManifestPlugin.ts:32`, 27: guard first 3 edits, 3 rounds, 1 added, 9 left; largest saving 1 edits, 1 rounds, 1 added, 11 left; guard if enough 1 edits, 1 rounds, 1 added, 11 left
- Excalidraw `src/components/App.tsx:1446`, 23: guard first 2 edits, 2 rounds, 1 added, 8 left; largest saving 1 edits, 1 rounds, 1 added, 8 left; guard if enough 1 edits, 1 rounds, 1 added, 8 left
- Excalidraw `src/components/App.tsx:2476`, 22: guard first 3 edits, 3 rounds, 1 added, 9 left; largest saving 1 edits, 1 rounds, 1 added, 10 left; guard if enough 1 edits, 1 rounds, 1 added, 10 left
- Excalidraw `src/components/App.tsx:3801`, 22: guard first 2 edits, 2 rounds, 1 added, 10 left; largest saving 2 edits, 2 rounds, 2 added, 9 left; guard if enough 2 edits, 2 rounds, 2 added, 9 left
- Excalidraw `src/components/App.tsx:3943`, 21: guard first 2 edits, 2 rounds, 0 added, 12 left; largest saving 1 edits, 1 rounds, 1 added, 7 left; guard if enough 1 edits, 1 rounds, 1 added, 7 left
- Excalidraw `src/components/App.tsx:5988`, 106: guard first stuck after 10 edits; largest saving stuck after 7 edits; guard if enough stuck after 7 edits
- Excalidraw `src/components/App.tsx:6536`, 142: guard first 11 edits, 4 rounds, 10 added, 15 left; largest saving 11 edits, 4 rounds, 11 added, 15 left; guard if enough 11 edits, 4 rounds, 10 added, 15 left
- Excalidraw `src/components/HintViewer.tsx:21`, 52: guard first 3 edits, 2 rounds, 2 added, 15 left; largest saving 3 edits, 2 rounds, 3 added, 15 left; guard if enough 3 edits, 2 rounds, 2 added, 15 left
- Excalidraw `src/components/LaserTool/LaserPathManager.ts:185`, 23: guard first 2 edits, 2 rounds, 1 added, 11 left; largest saving 1 edits, 1 rounds, 1 added, 8 left; guard if enough 1 edits, 1 rounds, 1 added, 8 left
- Excalidraw `src/element/binding.ts:599`, 17: guard first 1 edits, 1 rounds, 0 added, 12 left; largest saving 1 edits, 1 rounds, 1 added, 9 left; guard if enough 1 edits, 1 rounds, 0 added, 12 left
- Excalidraw `src/element/linearElementEditor.ts:320`, 32: guard first 2 edits, 2 rounds, 1 added, 12 left; largest saving 1 edits, 1 rounds, 1 added, 12 left; guard if enough 1 edits, 1 rounds, 1 added, 12 left
- Excalidraw `src/element/mutateElement.ts:23`, 40: guard first 3 edits, 3 rounds, 2 added, 10 left; largest saving 2 edits, 2 rounds, 2 added, 14 left; guard if enough 2 edits, 2 rounds, 2 added, 14 left
- Excalidraw `src/element/newElement.ts:410`, 21: guard first 2 edits, 2 rounds, 1 added, 9 left; largest saving 1 edits, 1 rounds, 1 added, 9 left; guard if enough 1 edits, 1 rounds, 1 added, 9 left
- Excalidraw `src/element/textElement.ts:167`, 19: guard first 1 edits, 1 rounds, 0 added, 13 left; largest saving 1 edits, 1 rounds, 1 added, 10 left; guard if enough 1 edits, 1 rounds, 0 added, 13 left
- Excalidraw `src/element/textElement.ts:472`, 41: guard first 3 edits, 3 rounds, 2 added, 11 left; largest saving 2 edits, 2 rounds, 2 added, 12 left; guard if enough 2 edits, 2 rounds, 2 added, 12 left
- Excalidraw `src/element/textWysiwyg.tsx:143`, 34: guard first stuck after 2 edits; largest saving 3 edits, 3 rounds, 3 added, 13 left; guard if enough 3 edits, 3 rounds, 3 added, 13 left
- Excalidraw `src/frame.ts:248`, 34: guard first 4 edits, 4 rounds, 2 added, 11 left; largest saving 2 edits, 2 rounds, 2 added, 14 left; guard if enough 2 edits, 2 rounds, 2 added, 14 left
- Excalidraw `src/packages/withinBounds.ts:159`, 33: guard first 2 edits, 2 rounds, 1 added, 15 left; largest saving 1 edits, 1 rounds, 1 added, 11 left; guard if enough 1 edits, 1 rounds, 1 added, 11 left
- Excalidraw `src/renderer/renderScene.ts:453`, 57: guard first 4 edits, 3 rounds, 3 added, 14 left; largest saving 4 edits, 3 rounds, 4 added, 14 left; guard if enough 4 edits, 3 rounds, 4 added, 14 left
- Excalidraw `src/snapping.ts:401`, 57: guard first 4 edits, 3 rounds, 3 added, 11 left; largest saving 2 edits, 2 rounds, 2 added, 11 left; guard if enough 2 edits, 2 rounds, 2 added, 11 left
- Excalidraw `src/snapping.ts:590`, 26: guard first 2 edits, 2 rounds, 1 added, 6 left; largest saving 1 edits, 1 rounds, 1 added, 8 left; guard if enough 1 edits, 1 rounds, 1 added, 8 left
- Excalidraw `src/snapping.ts:775`, 20: guard first 3 edits, 3 rounds, 1 added, 9 left; largest saving 1 edits, 1 rounds, 1 added, 10 left; guard if enough 1 edits, 1 rounds, 1 added, 10 left

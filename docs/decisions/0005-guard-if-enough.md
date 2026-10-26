---
description: The fix hint suggests a guard clause only when it alone brings the function to the max; otherwise it suggests whichever of the guard and the best move leaves the lower highest score.
status: accepted
---

# ADR-0005: Guard if enough

## Context

Each diagnostic suggests exactly one change (see "Fix" in the diagnostics spec). The rule finds at most one guard clause, around the deepest increment, and the best region to move into a new function. Often both help, and the rule has to pick one.

A guard clause removes complexity without moving code, and it is a small edit that skips nothing. But it saves only the nesting bonuses beneath it, so it often leaves the function over the max, and the next lint round suggests a move anyway.

Three strategies were compared:

- **Guard first**: the guard clause whenever one helps.
- **Largest saving**: whichever leaves the lower highest score, the guard clause on a tie.
- **Guard if enough**: the guard clause when it alone brings the function to the max, or else as largest saving.

The [strategy simulation](../evaluation/strategies.md) plays the lint loop mechanically on every function over the default max in four pinned open-source repositories, applying each hint and linting again until the function is at or under the max. The [agent pilot](../evaluation/agent-pilot.md) gave Claude Sonnet 5.5 44 such functions to fix, under this rule's message with guard first and under a bare score.

## Decision

The rule uses guard if enough. Guard first and largest saving stay available through `createRule`, so the simulation can keep comparing them.

## Rationale

**It reaches the max in fewer rounds, never more.** The strategies part on 64 of 319 functions. Over the 58 of those that every strategy brings to the max, guard if enough takes fewer lint rounds than guard first on 43 and more on none: 89 rounds against 144. Guard first's extra rounds mostly come before the same move: it still moves 5,652 lines into new functions after its guard clauses, against 5,949.

**It keeps the guard clause where the guard is enough.** Largest saving takes as few rounds, but passes over a guard clause that alone would reach the max on 10 functions, and adds 117 functions to guard if enough's 104. Guard if enough never passes over such a guard.

**Agents don't take a partial guard clause as the fix.** On the 8 pilot tasks where guard first suggested a guard that left the function over the max, agents extracted 1 to 4 functions anyway, as many as with a bare score. A hint that agents set aside costs a round and buys nothing.

## When guard first would be the better choice

Guard first adds fewer functions: 9 fewer over those 58, and its highest score left is lower on 21 of them, against 11 where guard if enough's is. If agents doing real work took a partial guard clause as a step and then reached the max with smaller, easier-to-review changes than they make from a move suggested straight away, those fewer functions would be worth the extra rounds. The pilot's tasks were too easy to show this either way: every run fixed its function in one pass. The agent benchmark on feature tasks (#53) can test it, and a result like that would supersede this ADR.

## Consequences

- At a low max, a guard clause is rarely enough, so it is suggested mostly when no region can move. The CLI fixtures run at max 0, so the tests that show where a guard clause qualifies, and check its promised score, use guard first.
- The hint evaluation on real code checks fewer guard clauses, since fewer are suggested.
- The stable part of the message, `has cognitive complexity N, over the max of M`, is unchanged; only the fix after it differs.

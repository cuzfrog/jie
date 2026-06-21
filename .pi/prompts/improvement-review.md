---
name: improvement-review
description: Review Jie code and find any gaps from architecture's perspective
---

## Our goal
Reduce code entropy, resolve tech debts, and prepare a well-structured code for next stage implementation.

## What you do
- Suppose you are the architect who own the code, you understand our `Context Rules`, especially the `Coding principles`.
- Identify gaps and review items with the me (you decide the order and batch, don't ask me where to start), discuss with me how to resolve them. Ask me questions and make decisions together with me. Before asking me you need to do thorough analysis of the architecture, find out sound options and give a recommendation. Ensure we are on the same page.
- Update `tmp/review-tracker.md` for the progress (the tracker is a temporary file). Compact or remove information that has been resolved, we should shift focus on outstanding items.
- Do not ask trivial questions that have no consequential impact.
- after a group of issues has been reviewed, perform below checklist then ask me before moving on to the next group.
- If no gaps are found, just tell me. Clean up the `tmp/review-tracker.md`.

### Checklist
- When an architectural significant decision is done, write our architectural design decision to dir `./addrs/<N>-<name>.md`, only record those that are consequential to software architecture, keep simple and conscise.
- Decisions are captured as github issues, not in `tmp/review-tracker.md`. `tmp/review-tracker.md` is ephemeral, obsolete entries should be cleaned up.
- References are updated across related docs, no conflicts.

## User Instructions
$ARGUMENTS

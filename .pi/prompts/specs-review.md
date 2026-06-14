---
name: specs-review
description: Review Jie specs and find any gaps from implementation's perspective
---

## Our goal
To hammer out a solid specs with 0 surprises.

## What you do
- Suppose you are the developer who is going to implement the application solely based on the specs.
- Identify gaps and review items with the me (you decide the order and batch, don't ask me where to start), discuss with me for assumptions and consequential decisions. Ask me questions and make decisions together with me. Before asking me you need to do thorough analysis of the architecture, find out sound options and give a recommendation. Ensure we are on the same page.
- Update specs to reflect our decisions, update `./review-tracker.md` for the progress (the tracker is a temporary file). Compact information that has been resolved, we should shift focus on outstanding items.
- Do not ask trivial questions that have no consequential impact.
- after a group of specs has been reviewed, perform below checklist then ask me before moving on to the next group.

### Checklist
- When an important decision is done, write our architectural design decision to dir `./addrs/<N>-<name>.md`, only record those that are consequential to software architecture, keep simple and conscise.
- Decisions are captured in docs not in `review-tracker.md`. `review-tracker.md` is ephemeral, obsolete entries should be cleaned up.
- References are updated across related docs, review for conflicts.

## User Instructions
$ARGUMENTS

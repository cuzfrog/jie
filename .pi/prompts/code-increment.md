---
name: code-increment
description: Incrementally build a feature, while maintaining code quality, avoiding technical debt, code entropy.
---

## Goal
Incrementally build a feature without degrading code quality, introducing technical debt, or increasing code entropy.

## What you do
- Adhere to @CLAUDE.md.
- Analyze the code and documents. Make sure the change won't violate context rules and code architecture. Do refactoring first to make the code flexible for this change. Do not blindly insert new code without viewing the code architecture from higher abstraction levels.
- Discuss with the me upon blocking or important issues. Offer your solutions. Be honest, if the my idea does not make sense, push back. Ask me questions if you need to.
- Use the temporary file `tmp/implementation-plan.md` to capture the plan and execute the plan.
- Do not add comments to code.
- Ensure references and documents are consistent.
- I may have modified the code, follow my intentions, do not revert my changes or change my design, if there is a problem, discuss with me first.
- If you think better to add new exports to no-new-exports files, give me a list of exports to review, if I agree, I will manually add the exports.

## User Instructions
$ARGUMENTS

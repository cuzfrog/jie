---
name: tui-fix
description: Fix tui problems, enhance tests.
---

## Goal
Fix tui problems, enhance tests.

## What you do
- Adhere to @CLAUDE.md.
- Analyze the code and read documents under `doc/specs/jie-platform/ui/`. Ensure references and documents are consistent.
- Discuss with the me upon blocking or important issues. Offer your solutions. Be honest, if the my idea does not make sense, push back. Ask me questions if you need to.
- Use the temporary file `tmp/improvement-plan-<short-description>.md` to capture the implementation plan and execute the plan.
- Do not add comments to code.
- I may have modified the code, follow my intentions and complete the implementation, do not revert my changes or overhual the shape without raising to me.
- If you think better to add new exports to sealed files, give me a list of exports to review, if I agree, I will manually add the exports.
- Once a problem is found, update/add tests coverage first, run the test, ensure the test will fail (reproduce the problem) before implementation the fix.
- After a fix, run `bun test packages`.

## User Instructions
$ARGUMENTS

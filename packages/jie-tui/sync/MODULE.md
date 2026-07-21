---
no-new-exports:
  - chat-sync.ts
---

# Design principles
- sync/ translates state transitions into structural child operations on the chat container: append/remove turn pairs only.
- Components own their content: they pull/update their MessageTurn and render lines; sync never diffs content.

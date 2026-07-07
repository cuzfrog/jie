---
sealed:
  - agents-rail.ts
  - agents-rail.test.ts
  - build-view.ts
  - build-view.test.ts
  - chat-pane.ts
  - chat-pane.test.ts
  - editor-slot.ts
  - editor-slot.test.ts
  - message-view.ts
  - message-view.test.ts
  - footer.test.ts
  - footer.ts
  - themes.test.ts
  - themes.ts
  - tool-card.ts
  - tool-card.test.ts
  - index.ts
---

## Design Principles
- view renders based on state, all inputs/events changes state via actions
- all theme related information should be in `themes.ts`; `chalk` should not be used outside `themes.ts`

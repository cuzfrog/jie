---
sealed:
  - layout.tsx
  - layout.test.tsx
  - editor.tsx
  - editor.test.tsx
  - footer.tsx
  - footer.test.tsx
---

# Design principles
- body = chat pane (+ optional rail) above the editor and footer.
- editor owns the prompt history; global input listener does not intercept plain arrow keys.
- footer is always 2 lines: identity strip + state/keymap/model strip.
# 29 — jie-ink `overflow="scrollBottom"` for ChatPane tail-anchoring

## Status

Accepted. Implemented and covered by `packages/jie-ink/src/render-node-to-output.test.tsx` and `packages/jie-tui/components/chat/chat-overflow-repro.test.tsx`.

## Context

A standard `Box height={N} overflow="hidden"` in ink renders the children at Yoga-computed coordinates inside an `N`-row clip rect. For a chat history whose natural height exceeds `N`, the visible region is the *top* of the history (since Yoga always anchors at row 0). The user asked for tail-anchoring: when new turns arrive, the visible region should slide to the bottom of the conversation, not stay pinned to the top.

The first pivot ("use terminal scrollback, like pi does") was deferred because, per `doc/specs/ui/tui-claude-code-reference.md`, the TUI uses `alternateScreen: true` which disables scrollback — the terminal itself does not retain history between paints. Anchoring has to be done inside jie-ink.

## Root cause of the naive attempt failing

A child of a `height={N} overflow="hidden"` Box appears at its `getComputedTop()`. The naive offset trick:

```ts
const childYOffset = -(naturalContentHeight - N);
children.forEach(c => render(c, {offsetY: y + childYOffset}));
```

looked correct until we measured: `contentBottom` was always `N`. Children are `Row`s of two `Text` lines — natural height ~60 for 30 turns. Yet `getComputedTop()` on the second Row was 12, not 28.

The reason is Yoga's default `flexShrink: 1`. When a flex column has a constrained height and its children's natural sum exceeds that height, Yoga shrinks each child proportionally to fit. The Box's children are no longer at their natural positions; they are compressed into `[0, N)`. So `cb = cy + ch` cannot exceed `N`, and the offset collapses to 0.

## Decision

Add a new overflow value `'scrollBottom'` (alongside the existing `'visible'` / `'hidden'`) on the `Box`'s `overflow` / `overflowY` style. When the renderer visits a Box with `overflowY === 'scrollBottom'`:

1. Read the box's `boxInnerHeight = height − borders` (a known constraint — the Box is the user-decided viewport).
2. Set `flexShrink: 0` on each direct child Yoga node (only direct children — grandchildren inherit through normal Yoga flow).
3. Call `yogaNode.calculateLayout(boxWidth, Yoga.UNDEFINED, Yoga.DIRECTION_LTR)` on the box itself. Yoga handles subtree layout. With `flexShrink=0` and an `UNDEFINED` outer height, children lay out at their natural tops.
4. Walk the children to compute `contentBottom = max(cy + ch)`.
5. If `contentBottom > boxInnerHeight`, set `childYOffset = -(contentBottom − boxInnerHeight)`. Otherwise `0`.
6. Recurse into children with `offsetY: y + childYOffset`. The clip rect is still `[y+border, y+height−border]` so anything that falls outside is naturally not drawn.

The re-layout pass is *not* restored. Subsequent renders will re-enter this branch and redo the calculation (a different set of children may now be present), which is the desired steady-state behaviour.

Why `yogaNode.calculateLayout(...)` instead of `findRootYogaNode(yogaNode).calculateLayout(...)`: the former only re-flows the affected subtree, which is cheap. Touching the whole root was both unnecessary and noisy when more than one scrollBottom box exists.

### Why not a separate "measure" pass?

Yoga has no "measure-only" mode — `calculateLayout` is the only way to get `getComputedTop` / `getComputedHeight`. Running it twice (once normally, once with `flexShrink=0`+`UNDEFINED`) is the simplest API and avoids touching the layout-cache invariants. The cost is a single Yoga pass per scrollBottom box per render — negligible at terminal sizes.

## Consequences

- ChatPane wraps its turns in `<Box overflow="scrollBottom" height={chatHeight}>`. The `flexShrink={0}` on that wrapper is belt-and-braces — the renderer also sets it on direct children internally — and is left explicit to read at the call site.
- `overflow="scrollBottom"` is additive on the existing styles enum (`'visible' | 'hidden' | 'scroll'` becomes `'visible' | 'hidden' | 'scroll' | 'scrollBottom'`). No existing call sites change behaviour.
- The existing `patchConsole: false` path uses the same renderer, so the behaviour is identical in production.
- Debug-mode visibility (`JIE_INK_DEBUG_SCROLL=1`) writes `[scrollBottom]` measurements to stderr via `process.stderr.write`. This goes through Node's stream API (not `console.*`) so it is testable without crossing the jie-platform `Console` boundary — jie-ink must not import from `@cuzfrog/jie-platform`.

## Open questions / follow-ups

- Scrolling *backwards* (page-up reveals older turns) is out of scope. `scrollBottom` is a tail-anchor; it does not introduce a scroll offset bound to state. If that becomes an NFR, it is a separate ADR.
- The clip rect strictly excludes anything above row 0. If a user-facing scrollbar indicator is wanted, it is a UI addition on top of this primitive.

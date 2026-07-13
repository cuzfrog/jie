/**
Pure helpers shared by the chat keyboard and wheel handlers. They
keep the "tail-pin → finite offset" transition honest so a user
navigating out of a tail-pinned view actually moves instead of
landing on `Infinity + delta = Infinity` in the reducer.
*/

export interface ScrollSliceSummary {
  readonly scrollOffset: number;
  readonly tailOffset: number;
}

/**
Clamp `current + delta` into `[0, tailOffset]`.
*/
export function computeNextOffset(current: number, delta: number, tailOffset: number): number {
  const next = current + delta;
  if (next <= 0) return 0;
  if (next >= tailOffset) return tailOffset;
  return next;
}

export type NavOutcome =
  | { readonly kind: "noop" }
  | { readonly kind: "scroll"; readonly newOffsetRows: number }
  | { readonly kind: "repin-tail" };

/**
Decide what action the chat navigation should dispatch given a
relative movement request against the current slice. The reducer
turns `scroll` into a finite offset store and `repin-tail` into a
`jumpChat('tail')` which clears the per-agent entry.
*/
export function planNavigation(slice: ScrollSliceSummary, delta: number): NavOutcome {
  if (delta === 0) return { kind: "noop" };
  if (slice.tailOffset === 0) return { kind: "noop" };
  const target = computeNextOffset(slice.scrollOffset, delta, slice.tailOffset);
  if (target === slice.scrollOffset) return { kind: "noop" };
  if (target === slice.tailOffset) return { kind: "repin-tail" };
  return { kind: "scroll", newOffsetRows: target };
}

# pi Theme System (reference)

How the upstream pi codebase structures theming. Sibling of `tui-layout.md`, `tui-pi-reference.md`, and our `packages/jie-tui/components/themes.ts`. The doc records findings from exploring `~/workspace/pi/pi` so the conversation does not have to be re-litigated.

## TL;DR

- One `Theme` class, one global singleton (`theme`).
- All foreground/background color rendering goes through `theme.fg(token, text)` and `theme.bg(token, text)` — never raw ANSI from component code.
- Chalk is imported once, inside the Theme class. Components never import chalk.
- pi-tui's `EditorTheme` is a thin adapter interface — a bag of `(text: string) => string` callbacks. The coding-agent supplies concrete implementations that close over the singleton.
- **No placeholder feature in the Editor.** Empty-state is rendered as a cursor-only line, or as a sibling `Text(...)` with `theme.fg("dim", ...)` showing a hint string.

## Theme class API

`/home/cuz/workspace/pi/pi/packages/coding-agent/src/modes/interactive/theme/theme.ts`

```ts
class Theme {
  fg(color: ThemeColor, text: string): string;   // pre-resets foreground only: `\x1b[39m`
  bg(color: ThemeBg,   text: string): string;   // pre-resets background only: `\x1b[49m`
  bold(text: string): string;
  italic(text: string): string;
  inverse(text: string): string;
  underline(text: string): string;
  strikethrough(text: string): string;
}
```

Tokens are a string-literal union (`"dim" | "muted" | "accent" | "border" | ...`). Internally, the Theme class pre-computes ANSI escape sequences from the loaded JSON and looks them up in a `Map`. `fg` returns `` `${ansi}${text}\x1b[39m` `` so the reset is foreground-only — that means **an outer `theme.fg("dim", …)` wrapper is cancelled by an inner `\x1b[39m` reset**. Components that colorize segments of a line have to split the wrapper around colored regions (see footer pattern below).

`chalk` is imported inside this file only. It is used **only** for the non-color attributes (`bold`, `italic`, `underline`, `inverse`, `strikethrough`). Foreground/background colors are generated as raw ANSI truecolor/256-color escapes by `fgAnsi`/`bgAnsi`. **No other module imports chalk.**

## Singleton, with a Proxy

```ts
const THEME_KEY = Symbol.for("@earendil-works/pi-coding-agent:theme");
export const theme: Theme = new Proxy({} as Theme, {
  get(_target, prop) {
    const t = (globalThis as Record<symbol, Theme>)[THEME_KEY];
    if (!t) throw new Error("Theme not initialized. Call initTheme() first.");
    return (t as unknown as Record<string | symbol, unknown>)[prop];
  },
});
```

`initTheme()` loads the JSON and writes to `globalThis[THEME_KEY]`. The `Proxy` indirection is deliberate: it makes tsx, jiti, and other loaders see the same theme even when modules are evaluated more than once. Components import `theme` directly — no prop drilling, no DI container.

## pi-tui boundary: thin adapter interfaces

pi-tui (the `@earendil-works/pi-tui` package) cannot import from coding-agent, so it accepts theme as a bag of `(text: string) => string` callbacks. `EditorTheme` is the contract:

```ts
export interface EditorTheme {
  borderColor: (str: string) => string;
  selectList: SelectListTheme;
}
```

`getEditorTheme()`, `getSelectListTheme()`, `getMarkdownTheme()`, etc., close over the singleton and translate token names into `theme.fg("token", str)` calls. **None of these adapters mention chalk.** They are the only seam where token names cross the boundary.

## Footer pattern: dim around colored segments

`/home/cuz/workspace/pi/pi/packages/coding-agent/src/modes/interactive/components/footer.ts` lines 222-231:

```ts
const dimStatsLeft = theme.fg("dim", statsLeft);
const remainder = statsLine.slice(statsLeft.length); // padding + rightSide
const dimRemainder = theme.fg("dim", remainder);
```

The comment at lines 223-225 is load-bearing:

> Apply dim to each part separately. `statsLeft` may contain color codes (for context %) that end with a reset, which would clear an outer dim wrapper. So we dim the parts before and after the colored section independently.

If we ever need to embed colored islands inside a dim-wrapped footer segment in jie, we must apply this split. Otherwise the inner reset silently strips the dim wrapper.

## Empty-input rendering: no placeholder

`pi-tui`'s `Editor` has no placeholder. From `/home/cuz/workspace/pi/pi/packages/tui/src/components/editor.ts` lines 884-892:

```ts
if (this.state.lines.length === 0 || (this.state.lines.length === 1 && this.state.lines[0] === "")) {
    layoutLines.push({ text: "", hasCursor: true, cursorPos: 0 });
    return layoutLines;
}
```

Empty renders top border, the cursor space (`\x1b[7m \x1b[0m`), bottom border. The `theme` does not touch the inner row.

When pi's coding-agent wants a hint string for empty input, it does **one of two things**:

1. **Sibling Text below.** `login-dialog.ts` line 158-159:
   ```ts
   this.contentContainer.addChild(new Text(theme.fg("dim", `e.g., ${placeholder}`), 1, 0));
   ```
2. **Substitute inside the inner row.** jie-style — replace the blank cursor row with `theme.fg("dim", "type a prompt...")` content. This is what our editor placeholder does in `packages/jie-tui/components/editor-slot.ts`.

## Implications for `packages/jie-tui/components/themes.ts`

Our `themes.ts` mirrors pi's split: it owns `chalk`, holds the token table, and exports concrete `(text: string) => string` adapter functions (`selectListTheme`, `markdownTheme`, `editorTheme`). The instruction from the project owner is that **chalk stays in themes.ts**; downstream components import themed callbacks from there, never chalk itself.

Concrete consequences:

- `editor-slot.ts` should not import chalk. It should pull whatever it needs from `themes.ts` (e.g. a `placeholderColor` hook / constant).
- `footer.ts` should not import chalk. It should pull all color styling from `themes.ts` exports.
- `build-view.ts` should not import chalk. Same rule.

We have not yet finalized which theme tokens to expose for the placeholder and the footer — that is a follow-up ADR/spec decision once user has chosen the surface.

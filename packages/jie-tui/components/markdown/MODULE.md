# Markdown

Renders a small but correct subset of markdown for assistant text blocks:
headings, paragraphs, lists, fenced code blocks, blockquotes, horizontal
rules, pipe tables, inline `code`, emphasis, strong, and OSC-8-gated links.

The tokenizer is a single-pass line-based scanner with no third-party
dependencies. The renderer is a pure React tree built from
`@cuzfrog/jie-ink` primitives, so it composes with the existing theme tokens
via `pickColor`.

External modules import from `markdown/index.ts`. The public surface is the
`Markdown` component and the `formatOsc8` / `tokenize` / `parseInline`
helpers.

## OSC-8

Gated by env var `INK_OSC8=1`. The renderer reads the env at module init
through `formatOsc8`; tests can override the env in a per-test setup.

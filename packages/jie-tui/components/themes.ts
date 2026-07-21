import type { MarkdownTheme } from "@earendil-works/pi-tui";

export const COLORS = {
  accent: "cyan",
  border: "blue",
  borderMuted: "gray",
  success: "green",
  error: "red",
  warning: "yellow",
  muted: "gray",
  dim: "gray",
  text: "white",
  thinkingText: "gray",
  userMessageIcon: "cyan",
  assistantMessageIcon: "cyan",
  toolTitle: "white",
  toolOutput: "gray",
} as const;

export type ColorName = keyof typeof COLORS;

const ANSI_FOREGROUND_CODES: Record<ColorName, number> = {
  accent: 36,
  border: 34,
  borderMuted: 90,
  success: 32,
  error: 31,
  warning: 33,
  muted: 90,
  dim: 90,
  text: 37,
  thinkingText: 90,
  userMessageIcon: 36,
  assistantMessageIcon: 36,
  toolTitle: 37,
  toolOutput: 90,
};

export function style(name: ColorName): (text: string) => string {
  const code = ANSI_FOREGROUND_CODES[name];
  return (text: string): string => `\x1b[${code}m${text}\x1b[39m`;
}

export function jieMarkdownTheme(): MarkdownTheme {
  return {
    heading: (text) => style("accent")(boldAttr(text)),
    link: (text) => style("accent")(text),
    linkUrl: (text) => style("muted")(text),
    code: (text) => style("warning")(text),
    codeBlock: (text) => style("text")(text),
    codeBlockBorder: (text) => style("borderMuted")(text),
    quote: (text) => style("muted")(text),
    quoteBorder: (text) => style("borderMuted")(text),
    hr: (text) => style("borderMuted")(text),
    listBullet: (text) => style("accent")(text),
    bold: boldAttr,
    italic: italicAttr,
    strikethrough: strikethroughAttr,
    underline: underlineAttr,
    codeBlockIndent: "  ",
  };
}

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
export const SPINNER_INTERVAL_MS = 80;

export const QUEUE_PREVIEW_MAX_CHARS = 40;

export const USER_PROMPT_PREFIX = "› ";
export const ASSISTANT_PREFIX = "● ";
export const THINKING_LABEL = "Thinking...";
export const WORKING_LABEL = "Working…";

export function formatQueueIndicator(queue: ReadonlyArray<string> | null | undefined): string | null {
  if (queue === undefined || queue === null || queue.length === 0) return null;
  const next = queue[0] ?? "";
  const preview = truncateCodePoints(next, QUEUE_PREVIEW_MAX_CHARS);
  const truncated = next.length > preview.length;
  const shown = truncated ? `${preview}…` : preview;
  const suffix = queue.length === 1 ? "prompt" : "prompts";
  return `${queue.length} ${suffix} queued  > ${shown}`;
}

function truncateCodePoints(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  let end = maxChars;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff && end < text.length) {
    end += 1;
  }
  return text.slice(0, end);
}

function boldAttr(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

function italicAttr(text: string): string {
  return `\x1b[3m${text}\x1b[23m`;
}

function strikethroughAttr(text: string): string {
  return `\x1b[9m${text}\x1b[29m`;
}

function underlineAttr(text: string): string {
  return `\x1b[4m${text}\x1b[24m`;
}

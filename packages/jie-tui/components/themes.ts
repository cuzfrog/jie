import { highlight, supportsLanguage, type Theme } from "cli-highlight";
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

export const BACKGROUND_CODES = {
  card: 236,
  cursor: 30,
} as const;

export type BackgroundName = keyof typeof BACKGROUND_CODES;

export function bg(name: BackgroundName): (text: string) => string {
  const code = BACKGROUND_CODES[name];
  return (text: string): string => `\x1b[48;5;${code}m${text}\x1b[49m`;
}

export function strikethrough(text: string): string {
  return `\x1b[9m${text}\x1b[29m`;
}

export function jieMarkdownTheme(): MarkdownTheme {
  return {
    heading: (text) => style("accent")(boldAttr(text)),
    link: (text) => style("accent")(text),
    linkUrl: (text) => style("muted")(text),
    code: (text) => style("warning")(text),
    codeBlock: (text) => style("text")(text),
    codeBlockBorder: (text) => style("borderMuted")(text),
    highlightCode: highlightCode,
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

export const USER_PROMPT_PREFIX = "› ";
export const ASSISTANT_PREFIX = "● ";
export const THINKING_LABEL = "Thinking...";
export const WORKING_LABEL = "Working…";

function highlightCode(code: string, lang?: string): string[] {
  if (lang === undefined || lang === "" || !supportsLanguage(lang)) {
    return code.split("\n").map((line) => style("text")(line));
  }
  return highlight(code, { language: lang, ignoreIllegals: true, theme: CODE_TOKEN_STYLES }).split("\n");
}

const CODE_TOKEN_STYLES: Theme = {
  keyword: style("accent"),
  built_in: style("accent"),
  "builtin-name": style("accent"),
  type: style("accent"),
  class: style("accent"),
  literal: style("warning"),
  number: style("warning"),
  symbol: style("warning"),
  regexp: style("warning"),
  string: style("success"),
  "meta-string": style("success"),
  addition: style("success"),
  deletion: style("error"),
  comment: style("muted"),
  doctag: style("muted"),
  meta: style("muted"),
  "meta-keyword": style("muted"),
  quote: style("muted"),
  function: (text) => style("text")(boldAttr(text)),
  title: (text) => style("text")(boldAttr(text)),
  section: style("accent"),
  tag: style("accent"),
  name: style("accent"),
  attr: style("warning"),
  attribute: style("warning"),
  "selector-tag": style("accent"),
  "selector-id": style("accent"),
  "selector-class": style("accent"),
  "selector-attr": style("warning"),
  "selector-pseudo": style("accent"),
  "template-tag": style("accent"),
  "template-variable": style("warning"),
  bullet: style("accent"),
  link: style("accent"),
  variable: style("text"),
  params: style("text"),
  subst: style("text"),
  formula: style("text"),
  code: style("text"),
  emphasis: italicAttr,
  strong: boldAttr,
  default: (text) => text,
};

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

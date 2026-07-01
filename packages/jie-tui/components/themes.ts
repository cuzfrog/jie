import { Chalk } from "chalk";
import type { EditorTheme, MarkdownTheme, SelectListTheme } from "@earendil-works/pi-tui";

const chalk = new Chalk({ level: 3 });

export const selectListTheme: SelectListTheme = {
  selectedPrefix: (text: string): string => chalk.hex(COLORS.accent)(text),
  selectedText: (text: string): string => chalk.hex(COLORS.accent).bold(text),
  description: (text: string): string => chalk.hex(COLORS.muted)(text),
  scrollInfo: (text: string): string => chalk.hex(COLORS.muted)(text),
  noMatch: (text: string): string => chalk.hex(COLORS.muted)(text),
};

export const markdownTheme: MarkdownTheme = {
  heading: (text: string): string => chalk.hex(COLORS.markdownHeading).bold(text),
  link: (text: string): string => chalk.hex(COLORS.markdownLink).underline(text),
  linkUrl: (text: string): string => chalk.hex(COLORS.markdownLinkUrl)(text),
  code: (text: string): string => chalk.hex(COLORS.markdownCode)(text),
  codeBlock: (text: string): string => chalk.hex(COLORS.markdownCodeBlock)(text),
  codeBlockBorder: (text: string): string => chalk.hex(COLORS.markdownCodeBlockBorder)(text),
  quote: (text: string): string => chalk.hex(COLORS.markdownQuote).italic(text),
  quoteBorder: (text: string): string => chalk.hex(COLORS.markdownQuoteBorder)(text),
  hr: (text: string): string => chalk.hex(COLORS.markdownHr)(text),
  listBullet: (text: string): string => chalk.hex(COLORS.markdownListBullet)(text),
  bold: (text: string): string => chalk.hex(COLORS.text).bold(text),
  italic: (text: string): string => chalk.hex(COLORS.text).italic(text),
  strikethrough: (text: string): string => chalk.hex(COLORS.text).strikethrough(text),
  underline: (text: string): string => chalk.hex(COLORS.text).underline(text),
};

export const editorTheme: EditorTheme = {
  borderColor: (text: string): string => chalk.hex(COLORS.borderMuted)(text),
  selectList: selectListTheme,
};

const COLORS = {
  accent: "#8abeb7",
  border: "#5f87ff",
  borderAccent: "#00d7ff",
  borderMuted: "#505050",
  success: "#b5bd68",
  error: "#cc6666",
  warning: "#ffff00",
  muted: "#808080",
  dim: "#666666",
  text: "#d4d4d4",
  thinkingText: "#808080",
  markdownHeading: "#f0c674",
  markdownLink: "#81a2be",
  markdownLinkUrl: "#666666",
  markdownCode: "#8abeb7",
  markdownCodeBlock: "#b5bd68",
  markdownCodeBlockBorder: "#808080",
  markdownQuote: "#808080",
  markdownQuoteBorder: "#808080",
  markdownHr: "#808080",
  markdownListBullet: "#8abeb7",
} as const;

import { Chalk } from "chalk";
import type { EditorTheme, MarkdownTheme, SelectListTheme } from "@earendil-works/pi-tui";

const chalk = new Chalk({ level: 3 });

const HEX = {
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
  mdHeading: "#f0c674",
  mdLink: "#81a2be",
  mdLinkUrl: "#666666",
  mdCode: "#8abeb7",
  mdCodeBlock: "#b5bd68",
  mdCodeBlockBorder: "#808080",
  mdQuote: "#808080",
  mdQuoteBorder: "#808080",
  mdHr: "#808080",
  mdListBullet: "#8abeb7",
} as const;

export const selectListTheme: SelectListTheme = {
  selectedPrefix: (text: string): string => chalk.hex(HEX.accent)(text),
  selectedText: (text: string): string => chalk.hex(HEX.accent).bold(text),
  description: (text: string): string => chalk.hex(HEX.muted)(text),
  scrollInfo: (text: string): string => chalk.hex(HEX.muted)(text),
  noMatch: (text: string): string => chalk.hex(HEX.muted)(text),
};

export const markdownTheme: MarkdownTheme = {
  heading: (text: string): string => chalk.hex(HEX.mdHeading).bold(text),
  link: (text: string): string => chalk.hex(HEX.mdLink).underline(text),
  linkUrl: (text: string): string => chalk.hex(HEX.mdLinkUrl)(text),
  code: (text: string): string => chalk.hex(HEX.mdCode)(text),
  codeBlock: (text: string): string => chalk.hex(HEX.mdCodeBlock)(text),
  codeBlockBorder: (text: string): string => chalk.hex(HEX.mdCodeBlockBorder)(text),
  quote: (text: string): string => chalk.hex(HEX.mdQuote).italic(text),
  quoteBorder: (text: string): string => chalk.hex(HEX.mdQuoteBorder)(text),
  hr: (text: string): string => chalk.hex(HEX.mdHr)(text),
  listBullet: (text: string): string => chalk.hex(HEX.mdListBullet)(text),
  bold: (text: string): string => chalk.hex(HEX.text).bold(text),
  italic: (text: string): string => chalk.hex(HEX.text).italic(text),
  strikethrough: (text: string): string => chalk.hex(HEX.text).strikethrough(text),
  underline: (text: string): string => chalk.hex(HEX.text).underline(text),
};

export const editorTheme: EditorTheme = {
  borderColor: (text: string): string => chalk.hex(HEX.borderMuted)(text),
  selectList: selectListTheme,
};

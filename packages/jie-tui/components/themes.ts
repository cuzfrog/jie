import { Chalk } from "chalk";
import type { EditorTheme, MarkdownTheme, SelectListTheme } from "@earendil-works/pi-tui";

const chalk = new Chalk({ level: 3 });

export const selectListTheme: SelectListTheme = {
  selectedPrefix: (text: string): string => chalk.blue(text),
  selectedText: (text: string): string => chalk.bold(text),
  description: (text: string): string => chalk.dim(text),
  scrollInfo: (text: string): string => chalk.dim(text),
  noMatch: (text: string): string => chalk.dim(text),
};

export const markdownTheme: MarkdownTheme = {
  heading: (text: string): string => chalk.bold.cyan(text),
  link: (text: string): string => chalk.blue(text),
  linkUrl: (text: string): string => chalk.dim(text),
  code: (text: string): string => chalk.yellow(text),
  codeBlock: (text: string): string => chalk.green(text),
  codeBlockBorder: (text: string): string => chalk.dim(text),
  quote: (text: string): string => chalk.italic(text),
  quoteBorder: (text: string): string => chalk.dim(text),
  hr: (text: string): string => chalk.dim(text),
  listBullet: (text: string): string => chalk.cyan(text),
  bold: (text: string): string => chalk.bold(text),
  italic: (text: string): string => chalk.italic(text),
  strikethrough: (text: string): string => chalk.strikethrough(text),
  underline: (text: string): string => chalk.underline(text),
};

export const editorTheme: EditorTheme = {
  borderColor: (text: string): string => chalk.dim(text),
  selectList: selectListTheme,
};

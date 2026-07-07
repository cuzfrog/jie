import { Markdown, type Component } from "@earendil-works/pi-tui";
import type { MessageBlock } from "../state";
import { Themes } from "./themes";

export class MessageView implements Component {
  private markdown: Markdown;

  constructor() {
    this.markdown = new Markdown("", 0, 0, Themes.markdownTheme);
  }

  setBlock(block: MessageBlock): void {
    this.markdown.setText(block.text);
  }

  render(width: number): string[] {
    return this.markdown.render(width);
  }

  invalidate(): void {
    this.markdown.invalidate();
  }
}

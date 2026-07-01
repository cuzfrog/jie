import { Markdown, type Component } from "@earendil-works/pi-tui";
import type { MessageBlock } from "../state";
import { markdownTheme } from "./themes";

export class MessageView implements Component {
  private markdown: Markdown;

  constructor() {
    this.markdown = new Markdown("", 0, 0, markdownTheme);
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

export function messageViewFromBlock(block: MessageBlock): MessageView {
  const view = new MessageView();
  view.setBlock(block);
  return view;
}

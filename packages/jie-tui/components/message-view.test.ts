import { MessageView, messageViewFromBlock } from "./message-view";
import type { MessageBlock } from "../state";

function textBlock(text: string): MessageBlock {
  return { kind: "text", text };
}

function thinkingBlock(text: string): MessageBlock {
  return { kind: "thinking", text };
}

describe("MessageView", () => {
  test("renders plain text", () => {
    const view = new MessageView();
    view.setBlock(textBlock("hello world"));
    const flat = view.render(80).join("\n");
    expect(flat).toContain("hello world");
  });

  test("renders multiple lines from a block with newlines", () => {
    const view = new MessageView();
    view.setBlock(textBlock("line one\nline two\nline three"));
    const lines = view.render(80);
    const flat = lines.join("\n");
    expect(flat).toContain("line one");
    expect(flat).toContain("line two");
    expect(flat).toContain("line three");
  });

  test("renders markdown emphasis", () => {
    const view = new MessageView();
    view.setBlock(textBlock("**bold** and *italic*"));
    const lines = view.render(80);
    expect(lines.join("\n").length).toBeGreaterThan(0);
  });

  test("renders fenced code block", () => {
    const view = new MessageView();
    view.setBlock(textBlock("```\nconst x = 1;\n```"));
    const lines = view.render(80);
    const flat = lines.join("\n");
    expect(flat).toContain("const x = 1;");
  });

  test("handles thinking block the same way as text", () => {
    const view = new MessageView();
    view.setBlock(thinkingBlock("reasoning chain"));
    expect(view.render(80).join("\n")).toContain("reasoning chain");
  });

  test("setBlock replaces the previous content", () => {
    const view = new MessageView();
    view.setBlock(textBlock("first"));
    expect(view.render(80).join("\n")).toContain("first");
    view.setBlock(textBlock("second"));
    const flat = view.render(80).join("\n");
    expect(flat).toContain("second");
    expect(flat).not.toContain("first");
  });
});

describe("messageViewFromBlock", () => {
  test("constructs a view whose first render shows the block", () => {
    const view = messageViewFromBlock(textBlock("hi"));
    expect(view.render(40).join("\n")).toContain("hi");
  });
});

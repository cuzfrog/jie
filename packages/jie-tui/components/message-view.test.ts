import { MessageView, messageViewFromBlock } from "./message-view";
import type { MessageBlock } from "../state";

function textBlock(text: string): MessageBlock {
  return { kind: "text", text };
}

function thinkingBlock(text: string): MessageBlock {
  return { kind: "thinking", text };
}

describe("MessageView", () => {
  test.each([
    {
      name: "plain text",
      block: () => textBlock("hello world"),
      expected: "hello world",
    },
    {
      name: "multiple lines from a block with newlines",
      block: () => textBlock("line one\nline two\nline three"),
      expected: ["line one", "line two", "line three"],
    },
    {
      name: "fenced code block",
      block: () => textBlock("```\nconst x = 1;\n```"),
      expected: "const x = 1;",
    },
    {
      name: "thinking block (same as text)",
      block: () => thinkingBlock("reasoning chain"),
      expected: "reasoning chain",
    },
  ])("renders $name", ({ block, expected }) => {
    const view = new MessageView();
    view.setBlock(block());
    const flat = view.render(80).join("\n");
    const expectedLines = Array.isArray(expected) ? expected : [expected];
    for (const line of expectedLines) expect(flat).toContain(line);
  });

  test("renders markdown emphasis", () => {
    const view = new MessageView();
    view.setBlock(textBlock("**bold** and *italic*"));
    expect(view.render(80).join("\n").length).toBeGreaterThan(0);
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

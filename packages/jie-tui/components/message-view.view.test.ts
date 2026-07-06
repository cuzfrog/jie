import { VirtualTerminal } from "../../../tests/support/virtual-terminal";
import { MessageView } from "./message-view";
import type { MessageBlock } from "../state";

function textBlock(text: string): MessageBlock {
  return { kind: "text", text };
}

function thinkingBlock(text: string): MessageBlock {
  return { kind: "thinking", text };
}

async function capture(view: MessageView, cols: number): Promise<string[]> {
  const terminal = new VirtualTerminal(cols, 80);
  terminal.start(() => {}, () => {});
  for (const line of view.render(cols)) {
    terminal.write(line + "\n");
  }
  return terminal.flushAndGetViewport();
}

describe("MessageView — view", () => {
  test("plain text renders as readable lines", async () => {
    const view = new MessageView();
    view.setBlock(textBlock("hello world"));
    const viewport = await capture(view, 80);
    const flat = viewport.join("\n");
    expect(flat).toContain("hello world");
  });

  test("multi-line text renders as multiple lines", () => {
    const view = new MessageView();
    view.setBlock(textBlock("line one\nline two\nline three"));
    const rendered = view.render(200);
    const flat = rendered.join("\n");
    expect(flat).toContain("line one");
    expect(flat).toContain("line two");
    expect(flat).toContain("line three");
  });

  test("markdown heading renders with non-empty output", async () => {
    const view = new MessageView();
    view.setBlock(textBlock("# Heading\n\nbody text"));
    const viewport = await capture(view, 80);
    const flat = viewport.join("\n");
    expect(flat.length).toBeGreaterThan(0);
    expect(flat).toContain("Heading");
  });

  test("fenced code block renders the code line", async () => {
    const view = new MessageView();
    view.setBlock(textBlock("```\nconst x = 1;\n```"));
    const viewport = await capture(view, 80);
    const flat = viewport.join("\n");
    expect(flat).toContain("const x = 1;");
  });

  test("thinking block renders the text verbatim", async () => {
    const view = new MessageView();
    view.setBlock(thinkingBlock("reasoning chain"));
    const viewport = await capture(view, 80);
    const flat = viewport.join("\n");
    expect(flat).toContain("reasoning chain");
  });

  test("setBlock replaces the rendered content", () => {
    const view = new MessageView();
    view.setBlock(textBlock("first"));
    const first = view.render(200);
    view.setBlock(textBlock("second"));
    const second = view.render(200);
    expect(first.join("\n")).toContain("first");
    expect(second.join("\n")).toContain("second");
    expect(second.join("\n")).not.toContain("first");
  });
});

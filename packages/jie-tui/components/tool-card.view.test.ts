import { VirtualTerminal } from "../../../tests/support/virtual-terminal";
import { ToolCard } from "./tool-card";
import type { MessageCard } from "../state";

function toolCall(overrides: Partial<MessageCard> = {}): MessageCard {
  return {
    kind: "toolCall",
    callId: "c1",
    name: "read_file",
    input: "/tmp/x.txt",
    ...overrides,
  };
}

function toolResult(overrides: Partial<MessageCard> = {}): MessageCard {
  return {
    kind: "toolResult",
    callId: "c1",
    name: "read_file",
    output: "file contents",
    durationMs: 42,
    error: null,
    ...overrides,
  };
}

async function capture(card: ToolCard, cols: number): Promise<string[]> {
  const terminal = new VirtualTerminal(cols, 30);
  terminal.start(() => {}, () => {});
  for (const line of card.render(cols)) {
    terminal.write(line + "\n");
  }
  return terminal.flushAndGetViewport();
}

describe("ToolCard — view", () => {
  test("toolCall renders the header line and the input body", async () => {
    const card = new ToolCard();
    card.setCard(toolCall());
    const viewport = await capture(card, 60);
    const flat = viewport.join("\n");
    expect(flat).toContain("● read_file");
    expect(flat).toContain("/tmp/x.txt");
  });

  test("toolCall empty input skips the body lines", async () => {
    const card = new ToolCard();
    card.setCard(toolCall({ input: "" }));
    const viewport = await capture(card, 60);
    const flat = viewport.join("\n");
    expect(flat).toContain("● read_file");
    expect(flat).not.toContain("/tmp/x.txt");
  });

  test("toolResult success shows the check glyph and duration", async () => {
    const card = new ToolCard();
    card.setCard(toolResult());
    const viewport = await capture(card, 60);
    const flat = viewport.join("\n");
    expect(flat).toContain("✓ read_file");
    expect(flat).toContain("42ms");
  });

  test("toolResult error shows the cross glyph and the error text", async () => {
    const card = new ToolCard();
    card.setCard(toolResult({ error: "ENOENT", output: null }));
    const viewport = await capture(card, 60);
    const flat = viewport.join("\n");
    expect(flat).toContain("✗ read_file");
    expect(flat).toContain("ENOENT");
  });

  test("long input is truncated to a fixed line cap with a count suffix", async () => {
    const card = new ToolCard();
    const longInput = Array.from({ length: 30 }, (_, i) => `line ${i}`).join("\n");
    card.setCard(toolCall({ input: longInput }));
    const viewport = await capture(card, 80);
    const flat = viewport.join("\n");
    expect(flat).toContain("… (");
  });

  test("empty before setCard renders zero lines", async () => {
    const card = new ToolCard();
    const viewport = await capture(card, 60);
    const visible = viewport.filter((line) => line.trim() !== "");
    expect(visible).toEqual([]);
  });
});

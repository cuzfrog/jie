import { Text } from "@earendil-works/pi-tui";
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

describe("ToolCard", () => {
  test("toolCall renders header + input body", () => {
    const card = new ToolCard();
    card.setCard(toolCall());
    const lines = card.render(60);
    expect(lines.join("\n")).toContain("● read_file");
    expect(lines.join("\n")).toContain("/tmp/x.txt");
  });

  test("toolCall with empty input shows only the header line of content", () => {
    const card = new ToolCard();
    card.setCard(toolCall({ input: "" }));
    const lines = card.render(60);
    const flat = lines.join("\n");
    expect(flat).toContain("● read_file");
    expect(flat).not.toContain("/tmp");
  });

  test("toolResult success shows check + name + duration", () => {
    const card = new ToolCard();
    card.setCard(toolResult());
    const lines = card.render(60);
    const flat = lines.join("\n");
    expect(flat).toContain("✓ read_file");
    expect(flat).toContain("42ms");
  });

  test("toolResult error shows cross + error text", () => {
    const card = new ToolCard();
    card.setCard(toolResult({ error: "ENOENT", output: null }));
    const lines = card.render(60);
    const flat = lines.join("\n");
    expect(flat).toContain("✗ read_file");
    expect(flat).toContain("ENOENT");
  });

  test("renders empty before setCard", () => {
    const card = new ToolCard();
    expect(card.render(60)).toEqual([]);
  });

  test("container children are Text primitives", () => {
    const card = new ToolCard();
    card.setCard(toolCall());
    card.render(60);
    const kids = card["container"].children;
    expect(kids.length).toBeGreaterThan(0);
    for (const k of kids) expect(k).toBeInstanceOf(Text);
  });

  test("long body truncates to max lines and shows ellipsis count", () => {
    const card = new ToolCard();
    const longInput = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    card.setCard(toolCall({ input: longInput }));
    const lines = card.render(80);
    const flat = lines.join("\n");
    expect(flat).toContain("… (");
    expect(flat).toContain("line 0");
  });
});

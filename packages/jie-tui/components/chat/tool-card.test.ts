import { visibleWidth } from "@earendil-works/pi-tui";
import type { ToolResultDetails } from "@cuzfrog/jie-platform";
import { type MessageCard, type StateStore } from "../../state";
import { makeTuiState } from "../../test";
import { ToolCard } from "./tool-card";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

function card(partial: Partial<MessageCard> = {}): MessageCard {
  return { kind: "toolResult", callId: "c1", name: "bash", ...partial };
}

function diffDetails(diff: string | null): ToolResultDetails {
  return { kind: "diff", path: "a.txt", replacementsCount: 1, beforeBytes: 2, afterBytes: 2, diff };
}

const bashDetails: ToolResultDetails = { exitCode: 0, truncated: { stdout: false, stderr: false } };

describe("ToolCard", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("collapsed by default: a single header line", () => {
    const view = new ToolCard(card({ output: "ok", durationMs: 12 }), stateStore);
    expect(view.render(80)).toEqual(["\x1b[32m✓\x1b[39m \x1b[37mbash  12ms\x1b[39m"]);
  });

  test("error cards use the error glyph and color", () => {
    const view = new ToolCard(card({ error: "boom" }), stateStore);
    expect(view.render(80)).toEqual(["\x1b[31m✗\x1b[39m \x1b[31mbash\x1b[39m"]);
  });

  test("expanded: input, output and error sections appear", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ toolCardsExpanded: true }));
    const view = new ToolCard(card({ input: "ls", output: "ok", error: "boom" }), stateStore);
    const lines = view.render(80);
    expect(lines[0]).toBe("\x1b[31m✗\x1b[39m \x1b[31mbash\x1b[39m");
    expect(lines[1]).toBe("\x1b[90minput:\x1b[39m");
    expect(lines[2]).toBe("\x1b[90mls\x1b[39m");
    expect(lines[3]).toBe("\x1b[90moutput:\x1b[39m");
    expect(lines[4]).toBe("\x1b[90mok\x1b[39m");
    expect(lines[5]).toBe("\x1b[31merror: boom\x1b[39m");
  });

  test("collapsed: a diff detail renders the diff block directly under the header, without a diff: label", () => {
    const view = new ToolCard(card({ details: diffDetails("@@ -1,1 +1,1 @@\n-a\n+b") }), stateStore);
    const lines = view.render(80);
    expect(lines).toEqual([
      "\x1b[32m✓\x1b[39m \x1b[37mbash\x1b[39m",
      "\x1b[90m@@ -1,1 +1,1 @@\x1b[39m",
      "\x1b[90m1 \x1b[39m\x1b[31m- a\x1b[39m",
      "\x1b[90m1 \x1b[39m\x1b[32m+ b\x1b[39m",
    ]);
  });

  test("collapsed: a null diff detail renders the header alone", () => {
    const view = new ToolCard(card({ details: diffDetails(null) }), stateStore);
    expect(view.render(80)).toEqual(["\x1b[32m✓\x1b[39m \x1b[37mbash\x1b[39m"]);
  });

  test("expanded: a diff detail renders input, output and a numbered diff section", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ toolCardsExpanded: true }));
    const view = new ToolCard(card({ input: "in", output: "ok", details: diffDetails("@@ -1,1 +1,1 @@\n-a\n+b") }), stateStore);
    const lines = view.render(80);
    expect(lines[1]).toBe("\x1b[90minput:\x1b[39m");
    expect(lines[2]).toBe("\x1b[90min\x1b[39m");
    expect(lines[3]).toBe("\x1b[90moutput:\x1b[39m");
    expect(lines[4]).toBe("\x1b[90mok\x1b[39m");
    expect(lines[5]).toBe("\x1b[90m@@ -1,1 +1,1 @@\x1b[39m");
    expect(lines[6]).toBe("\x1b[90m1 \x1b[39m\x1b[31m- a\x1b[39m");
    expect(lines[7]).toBe("\x1b[90m1 \x1b[39m\x1b[32m+ b\x1b[39m");
  });

  test("non-diff details render no diff section", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ toolCardsExpanded: true }));
    const view = new ToolCard(card({ output: "ok", details: bashDetails }), stateStore);
    expect(view.render(80).some((line) => line.includes("diff:"))).toBe(false);
  });

  test("truncated input and output get an ellipsis", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ toolCardsExpanded: true }));
    const view = new ToolCard(card({ input: "in", inputTruncated: true, output: "out", outputTruncated: true }), stateStore);
    const lines = view.render(80);
    expect(lines[2]).toBe("\x1b[90min…\x1b[39m");
    expect(lines[4]).toBe("\x1b[90mout…\x1b[39m");
  });

  test("never renders a line wider than the given width (doRender guard)", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ toolCardsExpanded: true }));
    const view = new ToolCard(card({
      name: "x".repeat(300),
      input: "x".repeat(300),
      output: "中文🎉".repeat(40),
      error: "x".repeat(300),
      details: diffDetails(`+${"x".repeat(300)}\n-${"中文🎉".repeat(40)}`),
    }), stateStore);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of view.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

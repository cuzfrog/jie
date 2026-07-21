import { visibleWidth } from "@earendil-works/pi-tui";
import { Actions, createStateStore } from "../../state";
import { ThinkingBlock } from "./thinking-block";

describe("ThinkingBlock", () => {
  test("collapsed by default: only the dim label", () => {
    const block = new ThinkingBlock("deep thought", createStateStore());
    expect(block.render(80)).toEqual(["\x1b[90mThinking...\x1b[39m"]);
  });

  test("expanded: label followed by dim wrapped text", () => {
    const store = createStateStore();
    store.dispatch(Actions.toggleThinking());
    const block = new ThinkingBlock("deep thought", store);
    expect(block.render(80)).toEqual(["\x1b[90mThinking...\x1b[39m", "\x1b[90mdeep thought\x1b[39m"]);
  });

  test("update replaces the streamed text", () => {
    const store = createStateStore();
    store.dispatch(Actions.toggleThinking());
    const block = new ThinkingBlock("a", store);
    block.update("ab");
    expect(block.render(80)[1]).toBe("\x1b[90mab\x1b[39m");
  });

  test("never renders a line wider than the given width (doRender guard)", () => {
    const store = createStateStore();
    store.dispatch(Actions.toggleThinking());
    const block = new ThinkingBlock(`${"x".repeat(300)}${"中文🎉".repeat(40)}`, store);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of block.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

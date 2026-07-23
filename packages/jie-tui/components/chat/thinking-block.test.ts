import { visibleWidth } from "@earendil-works/pi-tui";
import { type StateStore } from "../../state";
import { makeTuiState } from "../../test";
import { ThinkingBlock } from "./thinking-block";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

describe("ThinkingBlock", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("collapsed by default: only the dim label", () => {
    const block = new ThinkingBlock("deep thought", stateStore);
    expect(block.render(80)).toEqual(["\x1b[90mThinking...\x1b[39m"]);
  });

  test("expanded: label followed by dim wrapped text", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ thinkingExpanded: true }));
    const block = new ThinkingBlock("deep thought", stateStore);
    expect(block.render(80)).toEqual(["\x1b[90mThinking...\x1b[39m", "\x1b[90mdeep thought\x1b[39m"]);
  });

  test("update replaces the streamed text", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ thinkingExpanded: true }));
    const block = new ThinkingBlock("a", stateStore);
    block.update("ab");
    expect(block.render(80)[1]).toBe("\x1b[90mab\x1b[39m");
  });

  test("never renders a line wider than the given width (doRender guard)", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ thinkingExpanded: true }));
    const block = new ThinkingBlock(`${"x".repeat(300)}${"中文🎉".repeat(40)}`, stateStore);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of block.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

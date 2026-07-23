import { visibleWidth } from "@earendil-works/pi-tui";
import { type StateStore } from "../state";
import { makeTuiState } from "../test";
import { StatusLine } from "./status-line";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

describe("StatusLine", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders nothing when there are no banners", () => {
    expect(new StatusLine(stateStore).render(80)).toEqual([]);
  });

  test("renders the transient message in the muted color", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ transientMessage: "switched" }));
    expect(new StatusLine(stateStore).render(80)).toEqual(["\x1b[90mswitched\x1b[39m"]);
  });

  test("renders the error banner in the error color", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ errorBanner: "boom" }));
    expect(new StatusLine(stateStore).render(80)).toEqual(["\x1b[31mboom\x1b[39m"]);
  });

  test("renders transient above error when both are set", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ transientMessage: "t", errorBanner: "e" }));
    expect(new StatusLine(stateStore).render(80)).toEqual(["\x1b[90mt\x1b[39m", "\x1b[31me\x1b[39m"]);
  });

  test("truncates over-long banners to the given width", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ errorBanner: "x".repeat(200) }));
    const lines = new StatusLine(stateStore).render(40);
    expect(lines.length).toBe(1);
    expect(visibleWidth(lines[0]!)).toBeLessThanOrEqual(40);
  });

  test("never renders a line wider than the given width (doRender guard)", () => {
    stateStore.getState.mockReturnValue(makeTuiState({
      transientMessage: "中文🎉".repeat(40),
      errorBanner: "x".repeat(300),
    }));
    const line = new StatusLine(stateStore);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const rendered of line.render(width)) {
        expect(visibleWidth(rendered)).toBeLessThanOrEqual(width);
      }
    }
  });
});

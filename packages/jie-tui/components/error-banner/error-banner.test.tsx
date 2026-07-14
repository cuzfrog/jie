import { render } from "../../test-renderer";
import { TuiContext } from "../context";
import { ErrorBanner } from "./error-banner";
import { Actions, createStateStore } from "../../state";
import { makeContextValue } from "../../test-support";

describe("ErrorBanner", () => {
  test("renders nothing when state.errorBanner is null", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><ErrorBanner /></TuiContext.Provider>,
    );
    const frame = (lastFrame() ?? "").replace(/\[[0-9;]*m/g, "");
    expect(frame).toBe("");
    unmount();
  });

  test("renders nothing when state.errorBanner is empty", () => {
    const store = createStateStore();
    store.dispatch(Actions.setErrorMessage(""));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><ErrorBanner /></TuiContext.Provider>,
    );
    const frame = (lastFrame() ?? "").replace(/\[[0-9;]*m/g, "");
    expect(frame).toBe("");
    unmount();
  });

  test("renders the error message prefixed with ✗ when state.errorBanner is set", () => {
    const store = createStateStore();
    store.dispatch(Actions.setErrorMessage("something broke"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><ErrorBanner /></TuiContext.Provider>,
    );
    const frame = (lastFrame() ?? "").replace(/\[[0-9;]*m/g, "");
    expect(frame).toContain("✗ something broke");
    unmount();
  });
});

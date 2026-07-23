import { visibleWidth } from "@earendil-works/pi-tui";
import { createContainer, InjectionMode } from "awilix";
import { Actions, registerStateModule, type StateStore } from "../state";
import { type TuiCradle } from "../";
import { StatusLine } from "./status-line";

function makeStateStore(): StateStore {
  const container = createContainer<TuiCradle>({ injectionMode: InjectionMode.CLASSIC });
  registerStateModule(container);
  return container.cradle.stateStore;
}

describe("StatusLine", () => {
  test("renders nothing when there are no banners", () => {
    expect(new StatusLine(makeStateStore()).render(80)).toEqual([]);
  });

  test("renders the transient message in the muted color", () => {
    const store = makeStateStore();
    store.dispatch(Actions.setTransientMessage("switched"));
    expect(new StatusLine(store).render(80)).toEqual(["\x1b[90mswitched\x1b[39m"]);
  });

  test("renders the error banner in the error color", () => {
    const store = makeStateStore();
    store.dispatch(Actions.setErrorMessage("boom"));
    expect(new StatusLine(store).render(80)).toEqual(["\x1b[31mboom\x1b[39m"]);
  });

  test("renders transient above error when both are set", () => {
    const store = makeStateStore();
    store.dispatch(Actions.setTransientMessage("t"));
    store.dispatch(Actions.setErrorMessage("e"));
    expect(new StatusLine(store).render(80)).toEqual(["\x1b[90mt\x1b[39m", "\x1b[31me\x1b[39m"]);
  });

  test("truncates over-long banners to the given width", () => {
    const store = makeStateStore();
    store.dispatch(Actions.setErrorMessage("x".repeat(200)));
    const lines = new StatusLine(store).render(40);
    expect(lines.length).toBe(1);
    expect(visibleWidth(lines[0]!)).toBeLessThanOrEqual(40);
  });

  test("never renders a line wider than the given width (doRender guard)", () => {
    const store = makeStateStore();
    store.dispatch(Actions.setTransientMessage("中文🎉".repeat(40)));
    store.dispatch(Actions.setErrorMessage("x".repeat(300)));
    const line = new StatusLine(store);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const rendered of line.render(width)) {
        expect(visibleWidth(rendered)).toBeLessThanOrEqual(width);
      }
    }
  });
});

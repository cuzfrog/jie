import { Actions } from "../state";
import { _resolveGlobalKey } from "./view";

describe("resolveGlobalKey", () => {
  test("ctrl+t maps to toggleThinking", () => {
    expect(_resolveGlobalKey("\x14")).toEqual(Actions.toggleThinking());
  });

  test("ctrl+o maps to toggleToolCards", () => {
    expect(_resolveGlobalKey("\x0f")).toEqual(Actions.toggleToolCards());
  });

  test("shift+up maps to cycling to the previous agent", () => {
    expect(_resolveGlobalKey("\x1b[1;2A")).toEqual(Actions.switchCycleAgent(-1));
  });

  test("shift+down maps to cycling to the next agent", () => {
    expect(_resolveGlobalKey("\x1b[1;2B")).toEqual(Actions.switchCycleAgent(1));
  });

  test("ctrl arrows and shift+left are left to the editor", () => {
    expect(_resolveGlobalKey("\x1b[1;5A")).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;5B")).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;2D")).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;5D")).toBeNull();
  });

  test("any other key is left to the editor", () => {
    expect(_resolveGlobalKey("a")).toBeNull();
    expect(_resolveGlobalKey("\r")).toBeNull();
    expect(_resolveGlobalKey("\x1b[A")).toBeNull();
  });
});

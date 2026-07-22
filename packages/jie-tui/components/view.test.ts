import { Actions } from "../state";
import { _resolveGlobalKey } from "./view";

describe("resolveGlobalKey", () => {
  test("ctrl+t maps to toggleThinking", () => {
    expect(_resolveGlobalKey("\x14")).toEqual(Actions.toggleThinking());
  });

  test("ctrl+o maps to toggleToolCards", () => {
    expect(_resolveGlobalKey("\x0f")).toEqual(Actions.toggleToolCards());
  });

  test("shift+up and ctrl+up map to cycling to the previous agent", () => {
    expect(_resolveGlobalKey("\x1b[1;2A")).toEqual(Actions.switchCycleAgent(-1));
    expect(_resolveGlobalKey("\x1b[1;5A")).toEqual(Actions.switchCycleAgent(-1));
  });

  test("shift+down and ctrl+down map to cycling to the next agent", () => {
    expect(_resolveGlobalKey("\x1b[1;2B")).toEqual(Actions.switchCycleAgent(1));
    expect(_resolveGlobalKey("\x1b[1;5B")).toEqual(Actions.switchCycleAgent(1));
  });

  test("any other key is left to the editor", () => {
    expect(_resolveGlobalKey("a")).toBeNull();
    expect(_resolveGlobalKey("\r")).toBeNull();
    expect(_resolveGlobalKey("\x1b[A")).toBeNull();
  });
});

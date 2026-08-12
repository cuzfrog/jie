import { EFFORT_LEVELS, isEffortLevel, isModelAlias, MODEL_ALIASES, parseModelRef } from "./types";

describe("isEffortLevel", () => {
  test("accepts valid effort levels", () => {
    for (const level of EFFORT_LEVELS) {
      expect(isEffortLevel(level)).toBe(true);
    }
  });

  test("rejects non-string and unknown values", () => {
    expect(isEffortLevel("turbo")).toBe(false);
    expect(isEffortLevel(null)).toBe(false);
    expect(isEffortLevel(undefined)).toBe(false);
    expect(isEffortLevel(1)).toBe(false);
  });
});

describe("parseModelRef", () => {
  test("splits a provider/modelId pair", () => {
    expect(parseModelRef("anthropic/claude-sonnet-4")).toEqual({ provider: "anthropic", modelId: "claude-sonnet-4" });
  });

  test("rejects a missing slash", () => {
    expect(parseModelRef("claude")).toBeNull();
  });

  test("rejects an empty provider", () => {
    expect(parseModelRef("/claude")).toBeNull();
  });

  test("rejects an empty modelId", () => {
    expect(parseModelRef("anthropic/")).toBeNull();
  });
});

describe("isModelAlias", () => {
  test("accepts the three alias names", () => {
    for (const alias of MODEL_ALIASES) {
      expect(isModelAlias(alias)).toBe(true);
    }
  });

  test("rejects other strings and non-strings", () => {
    expect(isModelAlias("huge")).toBe(false);
    expect(isModelAlias("large")).toBe(true);
    expect(isModelAlias("anthropic/claude-sonnet-4")).toBe(false);
    expect(isModelAlias(null)).toBe(false);
    expect(isModelAlias(undefined)).toBe(false);
    expect(isModelAlias(1)).toBe(false);
  });
});

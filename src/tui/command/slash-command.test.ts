import { completeItems, hasPrefix, isAlreadyComplete } from "./slash-command";

describe("hasPrefix", () => {
  test("matches case-insensitively from the start", () => {
    expect(hasPrefix("OpenAI", "open")).toBe(true);
    expect(hasPrefix("OpenAI", "ai")).toBe(false);
    expect(hasPrefix("OpenAI", "")).toBe(true);
  });
});

describe("isAlreadyComplete", () => {
  test("is false for an empty prefix", () => {
    expect(isAlreadyComplete(["off", "low"], "")).toBe(false);
  });

  test("is true when the prefix exactly matches a candidate", () => {
    expect(isAlreadyComplete(["off", "low"], "off")).toBe(true);
    expect(isAlreadyComplete(["off", "low"], "OFF")).toBe(true);
  });

  test("is false when the prefix is only a prefix of a candidate", () => {
    expect(isAlreadyComplete(["off", "low"], "o")).toBe(false);
  });
});

describe("completeItems", () => {
  const ITEMS = [
    { value: "off", label: "off" },
    { value: "low", label: "low" },
    { value: "medium", label: "medium" },
    { value: "high", label: "high" },
    { value: "max", label: "max" },
  ] as const;

  test("returns all items when the prefix is empty", () => {
    const completion = completeItems([...ITEMS], "");
    expect(completion).not.toBeNull();
    expect(completion!.items.map((item) => item.value)).toEqual(["off", "low", "medium", "high", "max"]);
  });

  test("filters items by the value prefix", () => {
    const completion = completeItems([...ITEMS], "m");
    expect(completion!.items.map((item) => item.value)).toEqual(["medium", "max"]);
  });

  test("returns null when the prefix exactly matches a value", () => {
    expect(completeItems([...ITEMS], "off")).toBeNull();
  });

  test("returns null when no item matches", () => {
    expect(completeItems([...ITEMS], "turbo")).toBeNull();
  });

  test("caps the result at MAX_SUGGESTIONS", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ value: `item-${i}`, label: `item-${i}` }));
    const completion = completeItems(many, "");
    expect(completion!.items.length).toBe(20);
  });

  test("uses a custom matcher when provided", () => {
    const completion = completeItems(
      [{ value: "id-1", label: "one" }, { value: "id-2", label: "two" }],
      "two",
      (item, prefix) => hasPrefix(item.value, prefix) || hasPrefix(item.label, prefix),
    );
    expect(completion!.items[0]!.value).toBe("id-2");
  });
});

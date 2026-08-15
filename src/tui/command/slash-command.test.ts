import { completeItems, isAlreadyComplete } from "./slash-command";

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

  test("filters items by substring of the value", () => {
    const completion = completeItems([...ITEMS], "ed");
    expect(completion!.items.map((item) => item.value)).toEqual(["medium"]);
  });

  test("filters items case-insensitively", () => {
    const completion = completeItems([...ITEMS], "MED");
    expect(completion!.items.map((item) => item.value)).toEqual(["medium"]);
  });

  test("returns null when the prefix exactly matches a value", () => {
    expect(completeItems([...ITEMS], "off")).toBeNull();
  });

  test("returns null when no item matches", () => {
    expect(completeItems([...ITEMS], "turbo")).toBeNull();
  });

  test("returns all matches beyond MAX_SUGGESTIONS", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ value: `item-${i}`, label: `item-${i}` }));
    const completion = completeItems(many, "");
    expect(completion!.items.length).toBe(30);
  });

  test("uses a custom matcher when provided", () => {
    const completion = completeItems(
      [{ value: "id-1", label: "one" }, { value: "id-2", label: "two" }],
      "two",
      (item, prefix) => {
        const needle = prefix.toLowerCase();
        return item.value.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle);
      },
    );
    expect(completion!.items[0]!.value).toBe("id-2");
  });
});

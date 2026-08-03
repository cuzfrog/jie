import { singleLine } from "./single-line";

describe("singleLine", () => {
  test("replaces runs of line breaks with a single space", () => {
    expect(singleLine("first\nsecond\r\nthird")).toBe("first second third");
  });

  test("collapses consecutive line breaks into one space", () => {
    expect(singleLine("a\n\n\nb")).toBe("a b");
  });

  test("trims surrounding whitespace", () => {
    expect(singleLine("  padded\n  ")).toBe("padded");
  });

  test("returns single-line text unchanged", () => {
    expect(singleLine("plain text")).toBe("plain text");
  });

  test("returns empty string for blank input", () => {
    expect(singleLine("")).toBe("");
    expect(singleLine("\n\r\n")).toBe("");
  });
});

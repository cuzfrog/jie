import { expectNumber, expectOptionalString, expectString } from "./row-decode";

describe("row-decode", () => {
  describe("expectString", () => {
    test("returns the string when value is a string", () => {
      expect(expectString("hello")).toBe("hello");
    });

    test("throws when value is null", () => {
      expect(() => expectString(null)).toThrow("expected string");
    });

    test("throws when value is a number", () => {
      expect(() => expectString(42)).toThrow("expected string");
    });

    test("throws when value is a boolean", () => {
      expect(() => expectString(true)).toThrow("expected string");
    });
  });

  describe("expectOptionalString", () => {
    test("returns undefined when value is null", () => {
      expect(expectOptionalString(null)).toBeUndefined();
    });

    test("returns undefined when value is undefined", () => {
      expect(expectOptionalString(undefined)).toBeUndefined();
    });

    test("returns the string when value is a string", () => {
      expect(expectOptionalString("x")).toBe("x");
    });

    test("throws when value is a number", () => {
      expect(() => expectOptionalString(7)).toThrow("expected string");
    });
  });

  describe("expectNumber", () => {
    test("returns the number when value is a finite number", () => {
      expect(expectNumber(3)).toBe(3);
    });

    test("converts bigint to number", () => {
      expect(expectNumber(5n)).toBe(5);
    });

    test("throws when value is a string", () => {
      expect(() => expectNumber("3")).toThrow("expected number");
    });

    test("throws when value is NaN", () => {
      expect(() => expectNumber(NaN)).toThrow("expected number");
    });

    test("throws when value is Infinity", () => {
      expect(() => expectNumber(Infinity)).toThrow("expected number");
    });

    test("throws when value is null", () => {
      expect(() => expectNumber(null)).toThrow("expected number");
    });
  });
});

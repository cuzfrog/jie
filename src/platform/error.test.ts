import { isErrnoException } from "./error";

describe("isErrnoException", () => {
  test("returns false for non-Error values", () => {
    expect(isErrnoException("ENOENT")).toBe(false);
    expect(isErrnoException({ code: "ENOENT" })).toBe(false);
    expect(isErrnoException(null)).toBe(false);
    expect(isErrnoException(undefined)).toBe(false);
  });

  test("returns false for Errors without a string code", () => {
    expect(isErrnoException(new Error("boom"))).toBe(false);
    expect(isErrnoException(Object.assign(new Error("boom"), { code: 42 }))).toBe(false);
  });

  test("returns true for Errors with a string code", () => {
    expect(isErrnoException(Object.assign(new Error("not found"), { code: "ENOENT" }))).toBe(true);
  });
});

import { formatOsc8 } from "./osc8";

describe("formatOsc8", () => {
  const ORIGINAL_ENV = process.env.INK_OSC8;

  function setEnv(value: string | undefined): void {
    if (value === undefined) delete process.env.INK_OSC8;
    else process.env.INK_OSC8 = value;
  }

  afterEach(() => {
    setEnv(ORIGINAL_ENV);
  });

  test("returns osc8 escape sequence when INK_OSC8=1", () => {
    setEnv("1");
    const out = formatOsc8("https://example.com", "example");
    expect(out).toBe("]8;;https://example.com\\example]8;;\\");
  });

  test("returns label + parenthesized href when env unset", () => {
    setEnv(undefined);
    const out = formatOsc8("https://example.com", "example");
    expect(out).toBe("example (https://example.com)");
  });

  test("returns label + parenthesized href when env is not '1'", () => {
    setEnv("0");
    const out = formatOsc8("https://example.com", "example");
    expect(out).toBe("example (https://example.com)");
  });

  test("escapes the bell character in href so the sequence is safe", () => {
    setEnv("1");
    const out = formatOsc8("https://x.com/y", "x");
    expect(out).not.toContain("");
    expect(out).toContain("https://x.com/\\u0007y");
  });
});

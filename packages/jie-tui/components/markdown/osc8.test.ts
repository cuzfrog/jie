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

  test("falls back when href contains a control character", () => {
    setEnv("1");
    const out = formatOsc8("https://x.com/\x07y", "x");
    expect(out).toBe("x (https://x.com/\x07y)");
  });

  test("falls back when href contains an ESC byte", () => {
    setEnv("1");
    const out = formatOsc8("https://x.com/\x1b]0;oops", "x");
    expect(out).toBe("x (https://x.com/\x1b]0;oops)");
  });

  test("falls back when href contains a string terminator byte", () => {
    setEnv("1");
    const out = formatOsc8("https://x.com/\x9cclose", "x");
    expect(out).toBe("x (https://x.com/\x9cclose)");
  });

  test("rejects javascript: scheme and falls back", () => {
    setEnv("1");
    const out = formatOsc8("javascript:alert(1)", "click");
    expect(out).toBe("click (javascript:alert(1))");
  });

  test("rejects data: scheme and falls back", () => {
    setEnv("1");
    const out = formatOsc8("data:text/plain,hi", "hi");
    expect(out).toBe("hi (data:text/plain,hi)");
  });

  test("rejects vbscript: scheme and falls back", () => {
    setEnv("1");
    const out = formatOsc8("vbscript:msgbox", "x");
    expect(out).toBe("x (vbscript:msgbox)");
  });

  test("accepts mailto: scheme", () => {
    setEnv("1");
    const out = formatOsc8("mailto:a@b.com", "mail");
    expect(out).toContain("]8;;mailto:a@b.com");
  });

  test("accepts https: scheme case-insensitively", () => {
    setEnv("1");
    const out = formatOsc8("HTTPS://x.com", "x");
    expect(out).toContain("]8;;HTTPS://x.com");
  });

  test("accepts relative href without scheme", () => {
    setEnv("1");
    const out = formatOsc8("/foo/bar", "bar");
    expect(out).toContain("]8;;/foo/bar");
  });

  test("rejects empty href", () => {
    setEnv("1");
    const out = formatOsc8("", "x");
    expect(out).toBe("x ()");
  });
});

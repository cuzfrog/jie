import { formatContextPercent, contextPercentColor } from "./context-percent";

describe("formatContextPercent", () => {
  test("returns '—' when window is null", () => {
    expect(formatContextPercent(100, null)).toBe("—");
  });

  test("returns '—' when window is 0", () => {
    expect(formatContextPercent(0, 0)).toBe("—");
  });

  test("returns '0%' when used is 0", () => {
    expect(formatContextPercent(0, 1000)).toBe("0%/1k");
  });

  test("rounds percent down toward 100 and formats window as k-suffix", () => {
    expect(formatContextPercent(500, 1000)).toBe("50%/1k");
  });

  test("clamps percent to 100 when over the window", () => {
    expect(formatContextPercent(1500, 1000)).toBe("100%/1k");
  });

  test("formats 200000 as 200k", () => {
    expect(formatContextPercent(0, 200000)).toBe("0%/200k");
  });

  test("formats 128000 as 128k", () => {
    expect(formatContextPercent(12800, 128000)).toBe("10%/128k");
  });

  test("formats 1500 as 1k (floor not round)", () => {
    expect(formatContextPercent(0, 1500)).toBe("0%/1k");
  });
});

describe("contextPercentColor", () => {
  test("returns 'muted' when window is null", () => {
    expect(contextPercentColor(100, null)).toBe("muted");
  });

  test("returns 'muted' when window is 0", () => {
    expect(contextPercentColor(100, 0)).toBe("muted");
  });

  test("returns 'muted' below 70%", () => {
    expect(contextPercentColor(699, 1000)).toBe("muted");
  });

  test("returns 'warning' at exactly 70%", () => {
    expect(contextPercentColor(700, 1000)).toBe("warning");
  });

  test("returns 'warning' between 70% and 89%", () => {
    expect(contextPercentColor(890, 1000)).toBe("warning");
  });

  test("returns 'error' at exactly 90%", () => {
    expect(contextPercentColor(900, 1000)).toBe("error");
  });

  test("returns 'error' above 90%", () => {
    expect(contextPercentColor(950, 1000)).toBe("error");
  });
});

import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  test("sub-second durations render as whole milliseconds", () => {
    expect(formatDuration(23)).toBe("23ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  test("sub-minute durations render as seconds with one trimmed decimal", () => {
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(1234)).toBe("1.2s");
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(59949)).toBe("59.9s");
  });

  test("minute-scale durations render as minutes and seconds", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
    expect(formatDuration(125000)).toBe("2m 5s");
  });
});

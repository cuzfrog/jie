import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  test("sub-second durations render as whole milliseconds", () => {
    expect(formatDuration(23)).toBe("23ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  test("sub-minute durations render as rounded seconds", () => {
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(1234)).toBe("1s");
    expect(formatDuration(1500)).toBe("2s");
    expect(formatDuration(59499)).toBe("59s");
  });

  test("minute-scale durations render as minutes and seconds", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
    expect(formatDuration(125000)).toBe("2m 5s");
  });

  test("rounding at the minute boundary carries instead of rendering 60s", () => {
    expect(formatDuration(59500)).toBe("1m 0s");
    expect(formatDuration(59999)).toBe("1m 0s");
  });

  test("rounding at the minute-second boundary carries instead of rendering 60 seconds", () => {
    expect(formatDuration(119500)).toBe("2m 0s");
    expect(formatDuration(119499)).toBe("1m 59s");
    expect(formatDuration(60499)).toBe("1m 0s");
    expect(formatDuration(3599500)).toBe("60m 0s");
  });
});

const subject = {
  greet: function (name: string): string { return `hello ${name}`; },
};

const fileScopedMock = vi.fn();
const factoryMock = vi.fn(() => "factory-default");

describe("global mock isolation between tests", () => {
  test("a: configures a sticky return, a one-shot return, and a spy", () => {
    fileScopedMock.mockReturnValue("sticky");
    fileScopedMock.mockReturnValueOnce("once");
    factoryMock.mockReturnValue("overridden");
    expect(fileScopedMock()).toBe("once");
    expect(fileScopedMock()).toBe("sticky");
    expect(factoryMock()).toBe("overridden");
    vi.spyOn(subject, "greet").mockReturnValue("mocked");
    expect(subject.greet("x")).toBe("mocked");
  });

  test("b: nothing configured in test a leaks in", () => {
    expect(fileScopedMock()).toBe(undefined);
    expect(fileScopedMock).toHaveBeenCalledTimes(1);
    expect(factoryMock()).toBe("factory-default");
    expect(subject.greet("x")).toBe("hello x");
  });
});

describe("time faking", () => {
  afterEach(() => {
    vi.setSystemTime();
    vi.useRealTimers();
  });

  test("setSystemTime pins Date.now without fake timers and resets when called bare", () => {
    vi.setSystemTime(new Date("2030-05-06T07:08:09Z"));
    expect(new Date().getUTCFullYear()).toBe(2030);
    vi.setSystemTime();
    expect(new Date().getUTCFullYear()).not.toBe(2030);
  });

  test("useFakeTimers with now keeps the pinned clock across timer advancement", () => {
    vi.useFakeTimers({ now: new Date("2026-01-02T03:04:05Z") });
    vi.advanceTimersByTime(2500);
    expect(new Date().toISOString()).toBe("2026-01-02T03:04:07.500Z");
  });
});

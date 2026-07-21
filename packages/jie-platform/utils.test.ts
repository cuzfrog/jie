describe("logger", () => {
  const ORIGINAL_LEVEL = process.env.JIE_LOG_LEVEL;

  afterEach(() => {
    if (ORIGINAL_LEVEL === undefined) delete process.env.JIE_LOG_LEVEL;
    else process.env.JIE_LOG_LEVEL = ORIGINAL_LEVEL;
  });

  test("routes formatted logs through the Console abstraction to stderr, never stdout", async () => {
    process.env.JIE_LOG_LEVEL = "INFO";
    const specifier = "./utils.ts?logger-stderr";
    const utils = (await import(specifier)) as typeof import("./utils");
    const errorLines: string[] = [];
    vi.spyOn(utils.defaultConsole, "error").mockImplementation((line: string) => {
      errorLines.push(line);
    });
    const stdoutSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    utils.logger.info("hello-stderr");
    utils.logger.getSubLogger({ name: "jie.test" }).info("sub-stderr");
    expect(errorLines.join("\n")).toContain("hello-stderr");
    expect(errorLines.join("\n")).toContain("sub-stderr");
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});

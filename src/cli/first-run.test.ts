import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Console } from "../utils";
import { createFirstRunPorts, type FirstRunPorts, runFirstRunWelcome } from "./first-run";

function makeConsoleMock(): Console & {
  print: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
} {
  return { print: vi.fn(), error: vi.fn(), write: vi.fn() };
}

function makePorts(overrides: Partial<FirstRunPorts> = {}): FirstRunPorts {
  return {
    console: makeConsoleMock(),
    isInteractive: vi.fn(() => true),
    confirm: vi.fn(async () => true),
    isSentinelPresent: vi.fn(() => false),
    markSentinel: vi.fn(),
    installBundledTeam: vi.fn(async () => ["default-coders"]),
    ...overrides,
  };
}

describe("runFirstRunWelcome - decision logic", () => {
  test("noInstall=true short-circuits before any side effect", async () => {
    const ports = makePorts();
    await runFirstRunWelcome(ports, true);
    expect(ports.confirm).not.toHaveBeenCalled();
    expect(ports.installBundledTeam).not.toHaveBeenCalled();
    expect(ports.markSentinel).not.toHaveBeenCalled();
  });

  test("sentinel already present short-circuits before any side effect", async () => {
    const ports = makePorts({ isSentinelPresent: () => true });
    await runFirstRunWelcome(ports, false);
    expect(ports.confirm).not.toHaveBeenCalled();
    expect(ports.installBundledTeam).not.toHaveBeenCalled();
    expect(ports.markSentinel).not.toHaveBeenCalled();
  });

  test("non-interactive skips the prompt without marking the sentinel (do not suppress a future interactive run)", async () => {
    const ports = makePorts({ isInteractive: () => false });
    await runFirstRunWelcome(ports, false);
    expect(ports.confirm).not.toHaveBeenCalled();
    expect(ports.installBundledTeam).not.toHaveBeenCalled();
    expect(ports.markSentinel).not.toHaveBeenCalled();
  });

  test("confirm yes -> installs the bundled team, prints success, marks sentinel", async () => {
    const ports = makePorts({ confirm: vi.fn(async () => true) });
    await runFirstRunWelcome(ports, false);
    expect(ports.confirm).toHaveBeenCalledTimes(1);
    expect(ports.installBundledTeam).toHaveBeenCalledTimes(1);
    expect(ports.markSentinel).toHaveBeenCalledTimes(1);
    expect(ports.console.print).toHaveBeenCalledWith(expect.stringContaining("default-coders"));
  });

  test("confirm no -> skips install, prints a hint, still marks sentinel (do not nag)", async () => {
    const ports = makePorts({ confirm: vi.fn(async () => false) });
    await runFirstRunWelcome(ports, false);
    expect(ports.installBundledTeam).not.toHaveBeenCalled();
    expect(ports.markSentinel).toHaveBeenCalledTimes(1);
    expect(ports.console.print).toHaveBeenCalledWith(expect.stringContaining("jie team add"));
  });

  test("install failure -> prints error, still marks sentinel (give up, do not retry every run)", async () => {
    const ports = makePorts({ installBundledTeam: vi.fn(async () => { throw new Error("disk full"); }) });
    await runFirstRunWelcome(ports, false);
    expect(ports.console.error).toHaveBeenCalledWith(expect.stringContaining("disk full"));
    expect(ports.markSentinel).toHaveBeenCalledTimes(1);
  });

  test("confirm is asked with a question mentioning the team and the destination", async () => {
    const ports = makePorts();
    await runFirstRunWelcome(ports, false);
    const question = (ports.confirm as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? "";
    expect(question).toContain("default-coders");
  });
});

describe("createFirstRunPorts - wiring", () => {
  let homeJieDir: string;

  beforeEach(() => {
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-first-run-"));
  });

  afterEach(() => {
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  test("happy path installs the bundled default-coders and writes the sentinel", async () => {
    const consoleMock = makeConsoleMock();
    const ports = createFirstRunPorts({
      homeJieDir,
      console: consoleMock,
      isInteractive: () => true,
      confirm: vi.fn(async () => true),
    });
    await runFirstRunWelcome(ports, false);
    expect(existsSync(join(homeJieDir, "teams", "default-coders", "TEAM.md"))).toBe(true);
    expect(existsSync(join(homeJieDir, ".first-run-done"))).toBe(true);
    expect(consoleMock.print).toHaveBeenCalledWith(expect.stringContaining("default-coders"));
  });

  test("sentinel present skips install even when bundled content is available", async () => {
    const consoleMock = makeConsoleMock();
    const ports = createFirstRunPorts({
      homeJieDir,
      console: consoleMock,
      isInteractive: () => true,
      confirm: vi.fn(async () => true),
    });
    ports.markSentinel();
    await runFirstRunWelcome(ports, false);
    expect(existsSync(join(homeJieDir, "teams", "default-coders"))).toBe(false);
  });
});

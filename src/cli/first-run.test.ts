import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Console } from "../utils";
import { createFirstRunPorts, _mergeCodeLensEntry, type FirstRunPorts, runFirstRunWelcome } from "./first-run";

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
    installBundledTeam: vi.fn(async () => ["default-team"]),
    ensureBundledMcp: vi.fn(),
    ...overrides,
  };
}

interface BundledMcpServer {
  readonly transport: "stdio";
  readonly command: string;
  readonly args: readonly string[];
}
interface McpConfigShape {
  readonly servers: Readonly<Record<string, BundledMcpServer>>;
}
function parseMcpConfig(text: string): McpConfigShape {
  return JSON.parse(text);
}
function readMcpConfig(homeJieDir: string): McpConfigShape {
  return parseMcpConfig(readFileSync(join(homeJieDir, "mcp.json"), "utf-8"));
}
function asString(result: string | null): string {
  if (result === null) throw new Error("expected non-null merge result");
  return result;
}

describe("runFirstRunWelcome - decision logic", () => {
  test("noInstall=true short-circuits before any side effect", async () => {
    const ports = makePorts();
    await runFirstRunWelcome(ports, true);
    expect(ports.ensureBundledMcp).not.toHaveBeenCalled();
    expect(ports.confirm).not.toHaveBeenCalled();
    expect(ports.installBundledTeam).not.toHaveBeenCalled();
    expect(ports.markSentinel).not.toHaveBeenCalled();
  });

  test("sentinel already present still ensures bundled mcp but skips the team welcome", async () => {
    const ports = makePorts({ isSentinelPresent: () => true });
    await runFirstRunWelcome(ports, false);
    expect(ports.ensureBundledMcp).toHaveBeenCalledTimes(1);
    expect(ports.confirm).not.toHaveBeenCalled();
    expect(ports.installBundledTeam).not.toHaveBeenCalled();
    expect(ports.markSentinel).not.toHaveBeenCalled();
  });

  test("non-interactive ensures bundled mcp but skips the prompt without marking the sentinel", async () => {
    const ports = makePorts({ isInteractive: () => false });
    await runFirstRunWelcome(ports, false);
    expect(ports.ensureBundledMcp).toHaveBeenCalledTimes(1);
    expect(ports.confirm).not.toHaveBeenCalled();
    expect(ports.installBundledTeam).not.toHaveBeenCalled();
    expect(ports.markSentinel).not.toHaveBeenCalled();
  });

  test("confirm yes -> ensures mcp, installs the bundled team, prints success, marks sentinel", async () => {
    const ports = makePorts({ confirm: vi.fn(async () => true) });
    await runFirstRunWelcome(ports, false);
    expect(ports.ensureBundledMcp).toHaveBeenCalledTimes(1);
    expect(ports.confirm).toHaveBeenCalledTimes(1);
    expect(ports.installBundledTeam).toHaveBeenCalledTimes(1);
    expect(ports.markSentinel).toHaveBeenCalledTimes(1);
    expect(ports.console.print).toHaveBeenCalledWith(expect.stringContaining("default-team"));
  });

  test("confirm no -> ensures mcp, skips install, prints a hint, still marks sentinel (do not nag)", async () => {
    const ports = makePorts({ confirm: vi.fn(async () => false) });
    await runFirstRunWelcome(ports, false);
    expect(ports.ensureBundledMcp).toHaveBeenCalledTimes(1);
    expect(ports.installBundledTeam).not.toHaveBeenCalled();
    expect(ports.markSentinel).toHaveBeenCalledTimes(1);
    expect(ports.console.print).toHaveBeenCalledWith(expect.stringContaining("jie team add"));
  });

  test("install failure -> prints error, still marks sentinel (give up, do not retry every run)", async () => {
    const ports = makePorts({ installBundledTeam: vi.fn(async () => { throw new Error("disk full"); }) });
    await runFirstRunWelcome(ports, false);
    expect(ports.ensureBundledMcp).toHaveBeenCalledTimes(1);
    expect(ports.console.error).toHaveBeenCalledWith(expect.stringContaining("disk full"));
    expect(ports.markSentinel).toHaveBeenCalledTimes(1);
  });

  test("confirm is asked with a question mentioning the team and the destination", async () => {
    const ports = makePorts();
    await runFirstRunWelcome(ports, false);
    const question = (ports.confirm as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] ?? "";
    expect(question).toContain("default-team");
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

  test("happy path installs the bundled default-team, writes the sentinel, and ensures mcp.json", async () => {
    const consoleMock = makeConsoleMock();
    const ports = createFirstRunPorts({
      homeJieDir,
      console: consoleMock,
      isInteractive: () => true,
      confirm: vi.fn(async () => true),
    });
    await runFirstRunWelcome(ports, false);
    expect(existsSync(join(homeJieDir, "teams", "default-team", "TEAM.md"))).toBe(true);
    expect(existsSync(join(homeJieDir, ".first-run-done"))).toBe(true);
    expect(consoleMock.print).toHaveBeenCalledWith(expect.stringContaining("default-team"));
    expect(readMcpConfig(homeJieDir).servers["code-lens"]).toEqual({
      transport: "stdio",
      command: "code-lens",
      args: [],
    });
  });

  test("sentinel present skips the team install but still ensures mcp.json", async () => {
    const consoleMock = makeConsoleMock();
    const ports = createFirstRunPorts({
      homeJieDir,
      console: consoleMock,
      isInteractive: () => true,
      confirm: vi.fn(async () => true),
    });
    ports.markSentinel();
    await runFirstRunWelcome(ports, false);
    expect(existsSync(join(homeJieDir, "teams", "default-team"))).toBe(false);
    expect(readMcpConfig(homeJieDir).servers["code-lens"]).toEqual({
      transport: "stdio",
      command: "code-lens",
      args: [],
    });
  });

  test("preserves existing mcp.json servers when ensuring code-lens", async () => {
    writeFileSync(
      join(homeJieDir, "mcp.json"),
      JSON.stringify({ servers: { "my-server": { transport: "stdio", command: "foo", args: ["--x"] } } }),
    );
    const ports = createFirstRunPorts({ homeJieDir, console: makeConsoleMock(), isInteractive: () => false });
    await runFirstRunWelcome(ports, false);
    const servers = readMcpConfig(homeJieDir).servers;
    expect(servers["my-server"]).toEqual({ transport: "stdio", command: "foo", args: ["--x"] });
    expect(servers["code-lens"]).toEqual({ transport: "stdio", command: "code-lens", args: [] });
  });

  test("leaves a malformed mcp.json untouched", async () => {
    const malformed = "{not valid json";
    writeFileSync(join(homeJieDir, "mcp.json"), malformed);
    const ports = createFirstRunPorts({ homeJieDir, console: makeConsoleMock(), isInteractive: () => false });
    await runFirstRunWelcome(ports, false);
    expect(readFileSync(join(homeJieDir, "mcp.json"), "utf-8")).toBe(malformed);
  });
});

describe("mergeCodeLensEntry", () => {
  test("absent file serializes a code-lens-only config", () => {
    const servers = parseMcpConfig(asString(_mergeCodeLensEntry(null))).servers;
    expect(servers["code-lens"]).toEqual({ transport: "stdio", command: "code-lens", args: [] });
  });

  test("config without a servers field adds one with code-lens", () => {
    const servers = parseMcpConfig(asString(_mergeCodeLensEntry("{}"))).servers;
    expect(servers["code-lens"]).toEqual({ transport: "stdio", command: "code-lens", args: [] });
  });

  test("preserves existing servers and adds code-lens", () => {
    const existing = JSON.stringify({ servers: { "my-server": { transport: "stdio", command: "foo", args: [] } } });
    const servers = parseMcpConfig(asString(_mergeCodeLensEntry(existing))).servers;
    expect(servers["my-server"]).toEqual({ transport: "stdio", command: "foo", args: [] });
    expect(servers["code-lens"]).toEqual({ transport: "stdio", command: "code-lens", args: [] });
  });

  test("malformed JSON returns null (caller leaves the file untouched)", () => {
    expect(_mergeCodeLensEntry("{bad")).toBeNull();
  });

  test("non-object root returns null", () => {
    expect(_mergeCodeLensEntry("[]")).toBeNull();
  });

  test("non-object servers field returns null", () => {
    expect(_mergeCodeLensEntry(JSON.stringify({ servers: "nope" }))).toBeNull();
  });
});

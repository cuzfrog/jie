import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolRegistry } from "../tools";
import { loadMergedMcpConfig } from "./load-config";
import { McpManagerImpl, type McpConnector } from "./manager";
import type { McpConnection, McpToolDefinition } from "./stdio-connection";
import type { SubprocessFactory } from "./subprocess";

const subprocessFactory = vi.mocked<SubprocessFactory>({ spawn: vi.fn() });

function makeRegistry() {
  return vi.mocked<ToolRegistry>({ register: vi.fn(), resolve: vi.fn(), list: vi.fn() });
}

function fakeConnection(tools: McpToolDefinition[] = []) {
  const connection = vi.mocked<McpConnection>({ listTools: vi.fn(), callTool: vi.fn(), close: vi.fn() });
  connection.listTools.mockResolvedValue(tools);
  return connection;
}

function tool(name: string): McpToolDefinition {
  return { name, description: `desc ${name}`, inputSchema: { type: "object" } };
}

function writeMcpJson(dir: string, servers: Record<string, unknown>): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "mcp.json"), JSON.stringify({ servers }, null, 2), "utf-8");
}

describe("McpManagerImpl", () => {
  const tmpRoots: string[] = [];
  function track(path: string): string {
    tmpRoots.push(path);
    return path;
  }
  afterEach(() => {
    for (const path of tmpRoots) rmSync(path, { recursive: true, force: true });
    tmpRoots.length = 0;
  });

  function makeManager(home: string, connector: McpConnector) {
    const registry = makeRegistry();
    const mcpConfig = loadMergedMcpConfig(home, null);
    return { manager: new McpManagerImpl(registry, mcpConfig, subprocessFactory, connector), registry };
  }

  test("registers each advertised tool under mcp:<server>:<tool> with a sanitized tool name", async () => {
    const home = track(mkdtempSync(join(tmpdir(), "jie-home-")));
    writeMcpJson(home, { "code-lens": { transport: "stdio", command: "bun", args: ["main.ts"] } });
    const connector = vi.fn<McpConnector>();
    connector.mockResolvedValue(fakeConnection([tool("code_structure"), tool("cycles")]));
    const { manager, registry } = makeManager(home, connector);

    await manager.connectAll();

    expect(connector).toHaveBeenCalledTimes(1);
    const calls = registry.register.mock.calls;
    expect(calls.map(([key]) => key).sort()).toEqual(["mcp:code-lens:code_structure", "mcp:code-lens:cycles"]);
    const registered = calls.find(([key]) => key === "mcp:code-lens:code_structure");
    expect(registered?.[1].name).toBe("mcp_code-lens_code_structure");
  });

  test("passes the configured command and args through to the connector", async () => {
    const home = track(mkdtempSync(join(tmpdir(), "jie-home-")));
    writeMcpJson(home, { lens: { transport: "stdio", command: "bun", args: ["main.ts", "index.scip"] } });
    const connector = vi.fn<McpConnector>();
    connector.mockResolvedValue(fakeConnection());
    const { manager } = makeManager(home, connector);

    await manager.connectAll();

    expect(connector).toHaveBeenCalledWith(
      "lens",
      { transport: "stdio", command: "bun", args: ["main.ts", "index.scip"], auth: null },
      { subprocessFactory },
    );
  });

  test("continues past a server that fails to connect", async () => {
    const home = track(mkdtempSync(join(tmpdir(), "jie-home-")));
    writeMcpJson(home, {
      broken: { transport: "stdio", command: "nope" },
      good: { transport: "stdio", command: "bun" },
    });
    const connector = vi.fn<McpConnector>();
    connector.mockRejectedValueOnce(new Error("spawn failed"));
    connector.mockResolvedValueOnce(fakeConnection([tool("t1")]));
    const { manager, registry } = makeManager(home, connector);

    await expect(manager.connectAll()).resolves.toBeUndefined();
    expect(registry.register.mock.calls.map(([key]) => key)).toEqual(["mcp:good:t1"]);
  });

  test("closes the connection and skips registration when tool listing fails", async () => {
    const home = track(mkdtempSync(join(tmpdir(), "jie-home-")));
    writeMcpJson(home, { srv: { transport: "stdio", command: "bun" } });
    const connection = fakeConnection();
    connection.listTools.mockRejectedValue(new Error("listing blew up"));
    const connector = vi.fn<McpConnector>();
    connector.mockResolvedValue(connection);
    const { manager, registry } = makeManager(home, connector);

    await expect(manager.connectAll()).resolves.toBeUndefined();
    expect(registry.register).not.toHaveBeenCalled();
    expect(connection.close).toHaveBeenCalledTimes(1);
  });

  test("skips http servers without attempting a connection", async () => {
    const home = track(mkdtempSync(join(tmpdir(), "jie-home-")));
    writeMcpJson(home, { remote: { transport: "http", url: "https://mcp.example.com" } });
    const connector = vi.fn<McpConnector>();
    const { manager, registry } = makeManager(home, connector);

    await manager.connectAll();

    expect(connector).not.toHaveBeenCalled();
    expect(registry.register).not.toHaveBeenCalled();
  });

  test("dispose closes every connected server exactly once", async () => {
    const home = track(mkdtempSync(join(tmpdir(), "jie-home-")));
    writeMcpJson(home, {
      a: { transport: "stdio", command: "x" },
      b: { transport: "stdio", command: "y" },
    });
    const first = fakeConnection();
    const second = fakeConnection();
    const connector = vi.fn<McpConnector>();
    connector.mockResolvedValueOnce(first);
    connector.mockResolvedValueOnce(second);
    const { manager } = makeManager(home, connector);
    await manager.connectAll();

    await manager.dispose();
    await manager.dispose();

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).toHaveBeenCalledTimes(1);
  });

  test("dispose keeps closing the remaining servers when one close fails", async () => {
    const home = track(mkdtempSync(join(tmpdir(), "jie-home-")));
    writeMcpJson(home, {
      a: { transport: "stdio", command: "x" },
      b: { transport: "stdio", command: "y" },
    });
    const first = fakeConnection();
    first.close.mockRejectedValue(new Error("stuck pipe"));
    const second = fakeConnection();
    const connector = vi.fn<McpConnector>();
    connector.mockResolvedValueOnce(first);
    connector.mockResolvedValueOnce(second);
    const { manager } = makeManager(home, connector);
    await manager.connectAll();

    await expect(manager.dispose()).resolves.toBeUndefined();
    expect(second.close).toHaveBeenCalledTimes(1);
  });
});

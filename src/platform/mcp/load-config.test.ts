import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadMergedMcpConfig } from "./load-config";

function freshDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), "utf-8");
}

describe("loadMergedMcpConfig", () => {
  const tmpRoots: string[] = [];
  function track(path: string): string {
    tmpRoots.push(path);
    return path;
  }
  afterEach(() => {
    for (const path of tmpRoots) rmSync(path, { recursive: true, force: true });
    tmpRoots.length = 0;
  });

  test("returns an empty server map when neither global nor project config exists", () => {
    const home = track(freshDir("jie-home-"));
    const result = loadMergedMcpConfig(home, null);
    expect(result.servers.size).toBe(0);
  });

  test("parses a stdio server with command, args, and auth", () => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "mcp.json"), {
      servers: {
        "code-lens": {
          transport: "stdio",
          command: "bun",
          args: ["src/code-lens/main.ts", "index.scip"],
          auth: { tokenEnv: "CODE_LENS_TOKEN" },
        },
      },
    });
    const result = loadMergedMcpConfig(home, null);
    expect(result.servers.get("code-lens")).toEqual({
      transport: "stdio",
      command: "bun",
      args: ["src/code-lens/main.ts", "index.scip"],
      auth: { tokenEnv: "CODE_LENS_TOKEN" },
    });
  });

  test("parses an http server with url and auth", () => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "mcp.json"), {
      servers: {
        remote: { transport: "http", url: "https://mcp.example.com/v1", auth: { tokenEnv: "REMOTE_TOKEN" } },
      },
    });
    const result = loadMergedMcpConfig(home, null);
    expect(result.servers.get("remote")).toEqual({
      transport: "http",
      url: "https://mcp.example.com/v1",
      auth: { tokenEnv: "REMOTE_TOKEN" },
    });
  });

  test("defaults args to an empty array and auth to null when absent", () => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "mcp.json"), {
      servers: { minimal: { transport: "stdio", command: "npx" } },
    });
    const result = loadMergedMcpConfig(home, null);
    expect(result.servers.get("minimal")).toEqual({
      transport: "stdio",
      command: "npx",
      args: [],
      auth: null,
    });
  });

  test("loads project config when only project exists", () => {
    const home = track(freshDir("jie-home-"));
    const project = track(freshDir("jie-project-"));
    writeJson(join(project, "mcp.json"), {
      servers: { local: { transport: "stdio", command: "node", args: ["server.js"] } },
    });
    const result = loadMergedMcpConfig(home, project);
    expect(result.servers.get("local")).toEqual({
      transport: "stdio",
      command: "node",
      args: ["server.js"],
      auth: null,
    });
  });

  test("project config overrides global per server name, keeping unrelated servers", () => {
    const home = track(freshDir("jie-home-"));
    const project = track(freshDir("jie-project-"));
    writeJson(join(home, "mcp.json"), {
      servers: {
        shared: { transport: "stdio", command: "global-cmd", args: ["--global"] },
        kept: { transport: "http", url: "https://kept.example.com" },
      },
    });
    writeJson(join(project, "mcp.json"), {
      servers: { shared: { transport: "stdio", command: "project-cmd" } },
    });
    const result = loadMergedMcpConfig(home, project);
    expect(result.servers.size).toBe(2);
    expect(result.servers.get("shared")).toEqual({
      transport: "stdio",
      command: "project-cmd",
      args: [],
      auth: null,
    });
    expect(result.servers.get("kept")).toEqual({
      transport: "http",
      url: "https://kept.example.com",
      auth: null,
    });
  });

  test("ignores unknown fields at the root and on server entries", () => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "mcp.json"), {
      futureFlag: true,
      servers: {
        minimal: { transport: "stdio", command: "npx", retries: 3 },
      },
    });
    const result = loadMergedMcpConfig(home, null);
    expect(result.servers.get("minimal")).toEqual({
      transport: "stdio",
      command: "npx",
      args: [],
      auth: null,
    });
  });

  test("treats an absent servers field as an empty map", () => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "mcp.json"), {});
    const result = loadMergedMcpConfig(home, null);
    expect(result.servers.size).toBe(0);
  });

  test.each([
    {
      name: "root is an array",
      config: [],
      match: /root must be a JSON object/,
    },
    {
      name: "servers is not an object",
      config: { servers: ["code-lens"] },
      match: /servers must be an object/,
    },
    {
      name: "server entry is not an object",
      config: { servers: { broken: "stdio" } },
      match: /server 'broken' must be an object/,
    },
    {
      name: "transport missing",
      config: { servers: { broken: { command: "x" } } },
      match: /transport must be 'stdio' or 'http'/,
    },
    {
      name: "transport unrecognized",
      config: { servers: { broken: { transport: "websocket", url: "ws://x" } } },
      match: /transport must be 'stdio' or 'http'/,
    },
    {
      name: "stdio server without command",
      config: { servers: { broken: { transport: "stdio", args: [] } } },
      match: /command must be a string/,
    },
    {
      name: "args not an array",
      config: { servers: { broken: { transport: "stdio", command: "x", args: "--flag" } } },
      match: /args must be an array of strings/,
    },
    {
      name: "args element not a string",
      config: { servers: { broken: { transport: "stdio", command: "x", args: ["ok", 42] } } },
      match: /args must be an array of strings/,
    },
    {
      name: "http server without url",
      config: { servers: { broken: { transport: "http" } } },
      match: /url must be a string/,
    },
    {
      name: "auth not an object",
      config: { servers: { broken: { transport: "http", url: "https://x", auth: "TOKEN" } } },
      match: /auth must be an object/,
    },
    {
      name: "auth without tokenEnv",
      config: { servers: { broken: { transport: "http", url: "https://x", auth: {} } } },
      match: /auth\.tokenEnv must be a string/,
    },
    {
      name: "server name containing a colon",
      config: { servers: { "bad:name": { transport: "stdio", command: "x" } } },
      match: /invalid server name 'bad:name'/,
    },
    {
      name: "server name containing a glob character",
      config: { servers: { "bad*name": { transport: "stdio", command: "x" } } },
      match: /invalid server name 'bad\*name'/,
    },
    {
      name: "server name longer than 64 characters",
      config: { servers: { ["a".repeat(65)]: { transport: "stdio", command: "x" } } },
      match: /invalid server name/,
    },
  ])("rejects $name with code INVALID_CONFIG", ({ config, match }) => {
    const home = track(freshDir("jie-home-"));
    writeJson(join(home, "mcp.json"), config);
    expect(() => loadMergedMcpConfig(home, null)).toThrow(
      expect.objectContaining({ code: "INVALID_CONFIG", message: expect.stringMatching(match) }),
    );
  });

  test("rejects malformed JSON citing the file and the parser message", () => {
    const home = track(freshDir("jie-home-"));
    const path = join(home, "mcp.json");
    writeFileSync(path, "{ not json", "utf-8");
    expect(() => loadMergedMcpConfig(home, null)).toThrow(
      expect.objectContaining({
        code: "INVALID_CONFIG",
        message: expect.stringContaining(path),
      }),
    );
  });

  test("reports the source file path in validation errors", () => {
    const project = track(freshDir("jie-project-"));
    const home = track(freshDir("jie-home-"));
    const path = join(project, "mcp.json");
    writeJson(path, { servers: { broken: { transport: "nope" } } });
    expect(() => loadMergedMcpConfig(home, project)).toThrow(
      expect.objectContaining({ message: expect.stringContaining(path) }),
    );
  });
});

import { Value } from "typebox/value";
import type { ArtifactStore } from "../storage";
import type { ExecutionContext } from "../tools";
import { createMcpTool } from "./tool-adapter";
import type { McpConnection, McpToolDefinition } from "./stdio-connection";

const artifactStore = vi.mocked<ArtifactStore>({
  write: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
});

const executionContext: ExecutionContext = {
  sessionId: "session-1",
  teamId: "team-1",
  agentKey: "agent-1",
  agentRole: "engineer",
  artifactStore,
  toolArgs: new Map(),
};

function fakeConnection() {
  return vi.mocked<McpConnection>({
    listTools: vi.fn(),
    callTool: vi.fn(),
    close: vi.fn(),
  });
}

function definition(overrides: Partial<McpToolDefinition> = {}): McpToolDefinition {
  return { name: "index_status", description: "summarizes the index", inputSchema: { type: "object" }, ...overrides };
}

describe("createMcpTool", () => {
  test("sanitizes the registry name for LLM tool-name rules", () => {
    const tool = createMcpTool("code-lens", definition({ name: "code_structure" }), fakeConnection());
    expect(tool.name).toBe("mcp_code-lens_code_structure");
  });

  test("replaces characters outside [a-zA-Z0-9_-] with underscores", () => {
    const tool = createMcpTool("claude.ai", definition({ name: "search:v2" }), fakeConnection());
    expect(tool.name).toBe("mcp_claude_ai_search_v2");
  });

  test("truncates the sanitized name to 64 characters", () => {
    const tool = createMcpTool("srv", definition({ name: "t".repeat(100) }), fakeConnection());
    expect(tool.name).toHaveLength(64);
  });

  test("keeps the colon form in the human-facing label", () => {
    const tool = createMcpTool("code-lens", definition(), fakeConnection());
    expect(tool.label).toBe("mcp:code-lens:index_status");
    expect(tool.description).toBe("summarizes the index");
  });

  test("derives parameters from the server's JSON schema", () => {
    const tool = createMcpTool("srv", definition({
      inputSchema: { type: "object", properties: { pathPrefix: { type: "string" } }, required: ["pathPrefix"] },
    }), fakeConnection());
    expect(Value.Check(tool.parameters, { pathPrefix: "src" })).toBe(true);
    expect(Value.Check(tool.parameters, {})).toBe(false);
  });

  test("execute forwards the tool name and input, and returns the text content", async () => {
    const connection = fakeConnection();
    connection.callTool.mockResolvedValue({ isError: false, text: "index ok" });
    const tool = createMcpTool("srv", definition(), connection);
    await expect(tool.execute({ verbose: true }, executionContext)).resolves.toEqual({ content: "index ok" });
    expect(connection.callTool).toHaveBeenCalledWith("index_status", { verbose: true });
  });

  test("execute throws when the server reports a tool error, so the agent sees it", async () => {
    const connection = fakeConnection();
    connection.callTool.mockResolvedValue({ isError: true, text: "code-lens is not available" });
    const tool = createMcpTool("srv", definition(), connection);
    await expect(tool.execute({}, executionContext)).rejects.toThrow("code-lens is not available");
  });

  test("execute rejects immediately when the signal is already aborted", async () => {
    const connection = fakeConnection();
    connection.callTool.mockImplementation(() => new Promise(() => {}));
    const tool = createMcpTool("srv", definition(), connection);
    const controller = new AbortController();
    controller.abort();
    await expect(tool.execute({}, executionContext, controller.signal)).rejects.toThrow();
  });

  test("execute rejects when the signal aborts mid-call", async () => {
    const connection = fakeConnection();
    connection.callTool.mockImplementation(() => new Promise(() => {}));
    const tool = createMcpTool("srv", definition(), connection);
    const controller = new AbortController();
    const pending = tool.execute({}, executionContext, controller.signal);
    controller.abort(new Error("user cancelled"));
    await expect(pending).rejects.toThrow("user cancelled");
  });
});

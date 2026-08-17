import { visibleWidth } from "@earendil-works/pi-tui";
import type { McpServerSummary } from "../../../platform";
import { makeTuiState } from "../../test";
import { type StateStore } from "../../state";
import { McpPanel, _mcpPanelLines } from "./mcp-panel";
import { style } from "../themes";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

function connected(name: string, tools: { name: string; description: string | null }[]): McpServerSummary {
  return { name, transport: "stdio", status: "connected", tools, detail: null };
}

describe("McpPanel", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders nothing while the panel is hidden", () => {
    expect(new McpPanel(stateStore).render(80)).toEqual([]);
  });

  test("renders a boxed panel when visible", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ mcpPanelVisible: true, mcpServers: [connected("github", [{ name: "create_issue", description: "create an issue" }])] }));
    const lines = new McpPanel(stateStore).render(80);
    expect(lines[0]).toBe(style("borderMuted")(`┌${"─".repeat(78)}┐`));
    const text = lines.map(stripAnsi).join("\n");
    expect(text).toContain("MCP Servers");
    expect(text).toContain("github");
    expect(text).toContain("create_issue");
  });

  test("renders the close hint below the box", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ mcpPanelVisible: true, mcpServers: [] }));
    const lines = new McpPanel(stateStore).render(80);
    expect(lines[lines.length - 1]).toBe(style("dim")("Type /mcp to close."));
  });

  test("every rendered line fits the given width", () => {
    stateStore.getState.mockReturnValue(makeTuiState({
      mcpPanelVisible: true,
      mcpServers: [connected("github", [
        { name: "create_issue", description: "create an issue in a repository" },
        { name: "get_file", description: "get a file's contents" },
      ])],
    }));
    const panel = new McpPanel(stateStore);
    for (const width of [13, 40, 60, 80, 139]) {
      for (const line of panel.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe("McpPanel.update", () => {
  test("reports dirty when the panel becomes visible", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ mcpPanelVisible: false }));
    const panel = new McpPanel(stateStore);
    panel.update();
    stateStore.getState.mockReturnValue(makeTuiState({ mcpPanelVisible: true }));
    expect(panel.update()).toBe(true);
  });

  test("reports dirty when the server list changes", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ mcpPanelVisible: true, mcpServers: [] }));
    const panel = new McpPanel(stateStore);
    panel.update();
    stateStore.getState.mockReturnValue(makeTuiState({ mcpPanelVisible: true, mcpServers: [connected("x", [])] }));
    expect(panel.update()).toBe(true);
  });
});

describe("_mcpPanelLines", () => {
  test("shows an empty-config message when no servers are configured", () => {
    const text = _mcpPanelLines(80, []).map(stripAnsi).join("\n");
    expect(text).toContain("no mcp servers configured");
  });

  test("shows connected server with tool count and tools", () => {
    const lines = _mcpPanelLines(80, [connected("github", [{ name: "create_issue", description: "create an issue" }])]);
    const text = lines.map(stripAnsi).join("\n");
    expect(text).toContain("github");
    expect(text).toContain("(stdio, connected, 1 tool)");
    expect(text).toContain("create_issue");
    expect(text).toContain("create an issue");
  });

  test("shows plural tools count", () => {
    const lines = _mcpPanelLines(80, [connected("github", [
      { name: "a", description: null },
      { name: "b", description: null },
    ])]);
    expect(lines.map(stripAnsi).some((line) => line.includes("(stdio, connected, 2 tools)"))).toBe(true);
  });

  test("shows skipped server with reason", () => {
    const lines = _mcpPanelLines(80, [{ name: "jira", transport: "http", status: "skipped", tools: [], detail: "http not supported" }]);
    const text = lines.map(stripAnsi).join("\n");
    expect(text).toContain("jira");
    expect(text).toContain("(http, skipped: http not supported)");
  });

  test("shows failed server with message", () => {
    const lines = _mcpPanelLines(80, [{ name: "db", transport: "stdio", status: "failed", tools: [], detail: "spawn ENOENT" }]);
    const text = lines.map(stripAnsi).join("\n");
    expect(text).toContain("db");
    expect(text).toContain("(stdio, failed: spawn ENOENT)");
  });

  test("trims long tool descriptions to the panel width", () => {
    const longDescription = "x".repeat(200);
    const lines = _mcpPanelLines(40, [connected("srv", [{ name: "tool", description: longDescription }])]);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(40);
    }
  });
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

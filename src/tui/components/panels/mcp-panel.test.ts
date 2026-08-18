import { visibleWidth } from "@earendil-works/pi-tui";
import type { McpServerSummary } from "../../../platform";
import { makeTuiState } from "../../test";
import { Actions, type StateStore } from "../../state";
import { McpPanel, _mcpPanelLines } from "./mcp-panel";
import { style } from "../themes";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

function connected(name: string, tools: { name: string; description: string | null }[]): McpServerSummary {
  return { name, transport: "stdio", status: "connected", tools, detail: null };
}

describe("McpPanel", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
    stateStore.dispatch.mockClear();
  });

  test("renders nothing while the panel is hidden", () => {
    expect(new McpPanel(stateStore).render(80)).toEqual([]);
  });

  test("renders a boxed panel when visible", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ mcpPanelVisible: true, mcpServers: [connected("github", [])] }));
    const lines = new McpPanel(stateStore).render(80);
    expect(lines[0]).toBe(style("borderMuted")(`┌${"─".repeat(78)}┐`));
    const text = lines.map(stripAnsi).join("\n");
    expect(text).toContain("MCP Servers");
    expect(text).toContain("github");
  });

  test("renders the close hint below the box", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ mcpPanelVisible: true, mcpServers: [] }));
    const lines = new McpPanel(stateStore).render(80);
    expect(lines[lines.length - 1]).toBe(style("dim")("esc close · tab expand · ↑↓ move"));
  });

  test("every rendered line fits the given width", () => {
    stateStore.getState.mockReturnValue(makeTuiState({
      mcpPanelVisible: true,
      mcpCursorIndex: 0,
      mcpExpanded: new Set(["github"]),
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

describe("McpPanel.handleInput", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState({ mcpPanelVisible: true, mcpServers: [connected("a", []), connected("b", [])] }));
    stateStore.dispatch.mockClear();
  });

  test("esc toggles the panel", () => {
    const panel = new McpPanel(stateStore);
    panel.handleInput("\x1b");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.toggleMcpPanel());
  });

  test("down moves the cursor forward", () => {
    const panel = new McpPanel(stateStore);
    panel.handleInput("\x1b[B");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.moveMcpCursor(1));
  });

  test("up moves the cursor backward", () => {
    const panel = new McpPanel(stateStore);
    panel.handleInput("\x1b[A");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.moveMcpCursor(-1));
  });

  test("tab toggles expand for the pointed server", () => {
    const panel = new McpPanel(stateStore);
    panel.handleInput("\t");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.toggleMcpExpand());
  });
});

describe("McpPanel.update", () => {
  test("reports dirty when the cursor moves", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ mcpPanelVisible: true, mcpServers: [connected("a", [])], mcpCursorIndex: 0 }));
    const panel = new McpPanel(stateStore);
    panel.update();
    stateStore.getState.mockReturnValue(makeTuiState({ mcpPanelVisible: true, mcpServers: [connected("a", [])], mcpCursorIndex: 1 }));
    expect(panel.update()).toBe(true);
  });

  test("reports dirty when the expanded set changes", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ mcpPanelVisible: true, mcpServers: [connected("a", [])], mcpCursorIndex: 0, mcpExpanded: new Set<string>() }));
    const panel = new McpPanel(stateStore);
    panel.update();
    stateStore.getState.mockReturnValue(makeTuiState({ mcpPanelVisible: true, mcpServers: [connected("a", [])], mcpCursorIndex: 0, mcpExpanded: new Set(["a"]) }));
    expect(panel.update()).toBe(true);
  });
});

describe("_mcpPanelLines", () => {
  test("shows an empty-config message when no servers are configured", () => {
    const text = _mcpPanelLines(80, [], null, new Set<string>()).map(stripAnsi).join("\n");
    expect(text).toContain("no mcp servers configured");
  });

  test("shows only the server list when nothing is expanded", () => {
    const lines = _mcpPanelLines(80, [connected("github", [{ name: "create_issue", description: "x" }])], null, new Set<string>());
    const text = lines.map(stripAnsi).join("\n");
    expect(text).toContain("github");
    expect(text).not.toContain("create_issue");
  });

  test("does not show tools for the selected server unless it is expanded", () => {
    const lines = _mcpPanelLines(80, [connected("github", [{ name: "create_issue", description: "create an issue" }])], 0, new Set<string>());
    const text = lines.map(stripAnsi).join("\n");
    expect(text).not.toContain("create_issue");
  });

  test("shows tools for an expanded non-selected server", () => {
    const servers = [connected("github", [{ name: "a", description: null }]), connected("jira", [{ name: "b", description: null }])];
    const lines = _mcpPanelLines(80, servers, 0, new Set(["jira"]));
    const text = lines.map(stripAnsi).join("\n");
    expect(text).toContain("a");
    expect(text).toContain("b");
  });

  test("marks the cursor with a pointer", () => {
    const lines = _mcpPanelLines(80, [connected("a", []), connected("b", [])], 1, new Set<string>());
    const text = lines.map(stripAnsi).join("\n");
    expect(text).toMatch(/▸ b/);
  });

  test("shows connected server with tool count", () => {
    const lines = _mcpPanelLines(80, [connected("github", [{ name: "create_issue", description: "x" }])], 0, new Set<string>());
    const text = lines.map(stripAnsi).join("\n");
    expect(text).toContain("(stdio, connected, 1 tool)");
  });

  test("shows plural tools count", () => {
    const lines = _mcpPanelLines(80, [connected("github", [
      { name: "a", description: null },
      { name: "b", description: null },
    ])], 0, new Set<string>());
    expect(lines.map(stripAnsi).some((line) => line.includes("(stdio, connected, 2 tools)"))).toBe(true);
  });

  test("shows skipped server with reason", () => {
    const lines = _mcpPanelLines(80, [{ name: "jira", transport: "http", status: "skipped", tools: [], detail: "http not supported" }], 0, new Set<string>());
    const text = lines.map(stripAnsi).join("\n");
    expect(text).toContain("jira");
    expect(text).toContain("(http, skipped: http not supported)");
  });

  test("shows failed server with message", () => {
    const lines = _mcpPanelLines(80, [{ name: "db", transport: "stdio", status: "failed", tools: [], detail: "spawn ENOENT" }], 0, new Set<string>());
    const text = lines.map(stripAnsi).join("\n");
    expect(text).toContain("db");
    expect(text).toContain("(stdio, failed: spawn ENOENT)");
  });

  test("trims long tool descriptions to the panel width", () => {
    const longDescription = "x".repeat(200);
    const lines = _mcpPanelLines(40, [connected("srv", [{ name: "tool", description: longDescription }])], 0, new Set<string>());
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(40);
    }
  });

  test("indents expanded tools further than their server", () => {
    const servers = [connected("github", [{ name: "create_issue", description: "x" }])];
    const lines = _mcpPanelLines(80, servers, 0, new Set(["github"])).map(stripAnsi);
    const serverLine = lines.find((line) => line.includes("github"))!;
    const toolLine = lines.find((line) => line.includes("create_issue"))!;
    expect(serverLine.indexOf("github")).toBeLessThan(toolLine.indexOf("create_issue"));
  });
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

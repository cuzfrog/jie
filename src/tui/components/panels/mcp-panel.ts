import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { McpServerStatus, McpServerSummary, McpToolSummary } from "../../../platform";
import { type StateStore, type TuiState } from "../../state";
import { type TuiComponent } from "../..";
import { Panel } from "./panel";
import { style } from "../themes";

const HINT = "Type /mcp to close.";
const HEADING = "MCP Servers";
const NO_SERVERS = "no mcp servers configured (define servers in .jie/mcp.json)";
const TOOL_INDENT = "    ";
const SERVER_INDENT = "  ";

const STATUS_COLORS: { readonly [K in McpServerStatus]: "muted" | "warning" | "error" } = {
  connected: "muted",
  skipped: "warning",
  failed: "error",
};

export class McpPanel extends Panel implements TuiComponent {
  private mcpPanelVisible = false;
  private mcpServers: ReadonlyArray<McpServerSummary> = [];

  constructor(stateStore: StateStore) {
    super(stateStore);
  }

  update(): boolean {
    const state = this.stateStore.getState();
    if (state.mcpPanelVisible === this.mcpPanelVisible && state.mcpServers === this.mcpServers) return false;
    this.mcpPanelVisible = state.mcpPanelVisible;
    this.mcpServers = state.mcpServers;
    return true;
  }

  protected override isVisible(state: TuiState): boolean {
    return state.mcpPanelVisible;
  }

  protected override body(state: TuiState, inner: number): string[] {
    return mcpPanelLines(inner, state.mcpServers);
  }

  protected override topBorder(_state: TuiState, _width: number): string | null {
    return null;
  }

  protected override hint(_state: TuiState, width: number): string | null {
    return truncateToWidth(style("dim")(HINT), width);
  }
}

function mcpPanelLines(width: number, servers: ReadonlyArray<McpServerSummary>): string[] {
  const w = Math.max(1, width);
  if (servers.length === 0) return [style("muted")(truncateToWidth(NO_SERVERS, w))];
  const lines: string[] = [style("text")(HEADING)];
  for (const server of servers) {
    lines.push(serverLine(w, server));
    for (const tool of server.tools) {
      lines.push(toolLine(w, tool));
    }
  }
  return lines;
}

function serverLine(width: number, server: McpServerSummary): string {
  const text = `${SERVER_INDENT}${style("accent")(server.name)} ${style(STATUS_COLORS[server.status])(serverStatusText(server))}`;
  return truncateToWidth(text, width);
}

function serverStatusText(server: McpServerSummary): string {
  if (server.status === "connected") {
    const toolCount = `${server.tools.length} tool${server.tools.length === 1 ? "" : "s"}`;
    return `(${server.transport}, connected, ${toolCount})`;
  }
  return `(${server.transport}, ${server.status}: ${server.detail ?? ""})`;
}

function toolLine(width: number, tool: McpToolSummary): string {
  const nameText = `${TOOL_INDENT}${tool.name}`;
  const nameWidth = visibleWidth(nameText);
  if (tool.description === null || nameWidth >= width) return truncateToWidth(nameText, width);
  const gap = "  ";
  const descriptionWidth = Math.max(0, width - nameWidth - gap.length);
  return nameText + gap + style("dim")(truncateToWidth(tool.description, descriptionWidth));
}

export { mcpPanelLines as _mcpPanelLines };

import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { McpServerStatus, McpServerSummary, McpToolSummary } from "../../../platform";
import { Actions, type StateStore, type TuiState } from "../../state";
import { type TuiComponent } from "../..";
import { Panel } from "./panel";
import { style } from "../themes";

const HINT = "esc close · tab expand · ↑↓ move";
const HEADING = "MCP Servers";
const NO_SERVERS = "no mcp servers configured (define servers in .jie/mcp.json)";
const TOOL_INDENT = "    ";
const SERVER_INDENT = "";
const CURSOR = "▸ ";
const NO_CURSOR = "  ";

interface KeyFallback {
  handleInput(data: string): void;
  isShowingAutocomplete(): boolean;
}

const STATUS_COLORS: { readonly [K in McpServerStatus]: "muted" | "warning" | "error" } = {
  connected: "muted",
  skipped: "warning",
  failed: "error",
};

export class McpPanel extends Panel implements TuiComponent {
  private mcpPanelVisible = false;
  private mcpServers: ReadonlyArray<McpServerSummary> = [];
  private mcpCursorIndex: number | null = null;
  private mcpExpanded: ReadonlySet<string> = new Set<string>();
  private readonly editor: KeyFallback;

  constructor(stateStore: StateStore, editor: KeyFallback) {
    super(stateStore);
    this.editor = editor;
  }

  update(): boolean {
    const state = this.stateStore.getState();
    if (
      state.mcpPanelVisible === this.mcpPanelVisible &&
      state.mcpServers === this.mcpServers &&
      state.mcpCursorIndex === this.mcpCursorIndex &&
      state.mcpExpanded === this.mcpExpanded
    ) return false;
    this.mcpPanelVisible = state.mcpPanelVisible;
    this.mcpServers = state.mcpServers;
    this.mcpCursorIndex = state.mcpCursorIndex;
    this.mcpExpanded = state.mcpExpanded;
    return true;
  }

  handleInput(data: string): void {
    if (!this.editor.isShowingAutocomplete()) {
      if (matchesKey(data, "esc")) {
        this.stateStore.dispatch(Actions.toggleMcpPanel());
        return;
      }
      if (matchesKey(data, "up")) {
        this.stateStore.dispatch(Actions.moveMcpCursor(-1));
        return;
      }
      if (matchesKey(data, "down")) {
        this.stateStore.dispatch(Actions.moveMcpCursor(1));
        return;
      }
      if (matchesKey(data, "tab")) {
        this.stateStore.dispatch(Actions.toggleMcpExpand());
        return;
      }
    }
    this.editor.handleInput(data);
  }

  protected override isVisible(state: TuiState): boolean {
    return state.mcpPanelVisible;
  }

  protected override body(state: TuiState, inner: number): string[] {
    return mcpPanelLines(inner, state.mcpServers, state.mcpCursorIndex, state.mcpExpanded);
  }

  protected override topBorder(_state: TuiState, _width: number): string | null {
    return null;
  }

  protected override hint(_state: TuiState, width: number): string | null {
    return truncateToWidth(style("dim")(HINT), width);
  }
}

function mcpPanelLines(width: number, servers: ReadonlyArray<McpServerSummary>, cursor: number | null, expanded: ReadonlySet<string>): string[] {
  const w = Math.max(1, width);
  if (servers.length === 0) return [style("muted")(truncateToWidth(NO_SERVERS, w))];
  const lines: string[] = [style("text")(HEADING)];
  for (let index = 0; index < servers.length; index += 1) {
    const server = servers[index]!;
    const selected = index === cursor;
    lines.push(serverLine(w, server, selected));
    if (expanded.has(server.name)) {
      for (const tool of server.tools) {
        lines.push(toolLine(w, tool));
      }
    }
  }
  return lines;
}

function serverLine(width: number, server: McpServerSummary, selected: boolean): string {
  const marker = selected ? style("accent")(CURSOR) : NO_CURSOR;
  const text = `${SERVER_INDENT}${marker}${style("accent")(server.name)} ${style(STATUS_COLORS[server.status])(serverStatusText(server))}`;
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

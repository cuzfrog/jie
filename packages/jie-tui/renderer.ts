import { type AgentStatus, type Block, type Card, type Turn, type TuiState } from "./state";

export interface RenderOptions {
  cols: number;
  rows: number;
  cwd?: string;
  branch?: string;
  provider?: string;
  modelId?: string;
  effort?: string;
}

const RAIL_COLS_SMALL = 12;
const RAIL_COLS_MIN_WIDE = 15;
const RAIL_COLS_MAX_WIDE = 24;

const FLICKER_DEBOUNCE_MS = 50;
const QUEUE_PROMPT_TRUNCATION = 100;

const railWidth = (cols: number): number => {
  if (cols < 80) return Math.max(RAIL_COLS_SMALL, Math.floor(cols * 0.25));
  return Math.min(RAIL_COLS_MAX_WIDE, Math.max(RAIL_COLS_MIN_WIDE, Math.floor(cols * 0.2)));
};

const visibleWidth = (s: string): number => {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      code > 0x1100 &&
      (code <= 0x115f ||
        code === 0x2329 ||
        code === 0x232a ||
        (code >= 0x2e80 && code <= 0x3247 && code !== 0x303f) ||
        (code >= 0x3250 && code <= 0x4dbf) ||
        (code >= 0x4e00 && code <= 0xa4cf) ||
        (code >= 0xa960 && code <= 0xa97f) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe30 && code <= 0xfe4f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x20000 && code <= 0x2fffd) ||
        (code >= 0x30000 && code <= 0x3fffd))
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
};

const wrapText = (text: string, width: number): string[] => {
  if (width <= 0) return [""];
  const out: string[] = [];
  for (const rawLine of text.split("\n")) {
    if (rawLine === "") {
      out.push("");
      continue;
    }
    const words = rawLine.split(/(\s+)/);
    let current = "";
    for (const w of words) {
      if (visibleWidth(current + w) > width) {
        if (current === "") {
          const chunk = Math.max(1, width);
          for (let i = 0; i < w.length; i += chunk) {
            out.push(w.slice(i, i + chunk));
          }
        } else {
          out.push(current);
          current = w.trimStart();
        }
      } else {
        current += w;
      }
    }
    if (current !== "") out.push(current);
  }
  return out;
};

const padRight = (s: string, width: number): string =>
  s + " ".repeat(Math.max(0, width - visibleWidth(s)));

const truncate = (s: string, width: number): string => {
  if (visibleWidth(s) <= width) return s;
  return s.slice(0, Math.max(0, width - 1)) + "…";
};

const HORIZONTAL_RULE = "─";
const VERTICAL_RULE = "│";

const statusGlyph = (status: AgentStatus, flickerBusy: boolean): string => {
  if (status === "busy" || flickerBusy) return "⠋";
  if (status === "err") return "✗";
  return "·";
};

const renderCardLine = (card: Card): string => {
  if (card.kind === "toolCall") {
    return "● " + card.name + "  " + (card.input ?? "");
  }
  if (card.kind === "toolResult") {
    const ok = card.error === null || card.error === undefined;
    const glyph = ok ? "✓" : "✗";
    const ms = card.durationMs !== undefined ? `${card.durationMs}ms` : "";
    return glyph + " " + card.name + "  " + ms;
  }
  return "";
};

const renderTurn = (turn: Turn, contentWidth: number): string[] => {
  const lines: string[] = [];
  const promptLines = wrapText(turn.userPrompt, Math.max(1, contentWidth - 2));
  promptLines.forEach((p, i) => {
    const prefix = i === 0 ? "› " : "  ";
    lines.push(prefix + p);
  });
  for (const card of turn.cards) {
    lines.push(renderCardLine(card));
  }
  for (const block of turn.blocks) {
    lines.push(...renderBlock(block, contentWidth));
  }
  return lines;
};

const renderBlock = (block: Block, contentWidth: number): string[] => {
  if (block.kind === "thinking") {
    if (block.expanded) {
      return wrapText(block.text, Math.max(1, contentWidth - 2)).map((l) => "  " + l);
    }
    return ["  Thinking..."];
  }
  return wrapText(block.text, Math.max(1, contentWidth - 2)).map((l) => "  " + l);
};

const renderRail = (state: TuiState, railWidth: number, bodyHeight: number, now: number): string[] => {
  const rows: string[] = [];
  const agents = Array.from(state.agents.values()).sort((a, b) => {
    if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
    return a.agentKey.localeCompare(b.agentKey);
  });
  if (agents.length === 0) {
    rows.push("(no agents)");
  } else {
    const focused = state.focusedAgentId;
    for (const a of agents) {
      const star = a.isLeader ? "★" : " ";
      const flicker = a.status === "idle" && now - a.lastIdleAt < FLICKER_DEBOUNCE_MS;
      const glyph = statusGlyph(a.status, flicker);
      const focus = a.agentId === focused ? ">" : " ";
      rows.push(truncate(focus + star + " " + glyph + " " + a.role, railWidth));
    }
  }
  while (rows.length < bodyHeight) rows.push("");
  return rows.slice(0, bodyHeight);
};

const renderChat = (state: TuiState, contentWidth: number, contentRows: number, now: number): string[] => {
  const focused = state.focusedAgentId;
  if (focused === null) {
    return padLines(wrapText("Loading team…", contentWidth), contentRows);
  }
  const agent = state.agents.get(focused);
  if (agent === undefined) {
    return padLines(wrapText("(no agent selected)", contentWidth), contentRows);
  }
  const turns: Turn[] = [...agent.history];
  if (agent.currentTurn !== null) turns.push(agent.currentTurn);
  const lines: string[] = [];
  for (let i = 0; i < turns.length; i++) {
    if (i > 0) lines.push("");
    lines.push(...renderTurn(turns[i]!, contentWidth));
  }
  if (state.queue.length > 0) {
    lines.push("");
    const peek = state.queue[0]!.slice(0, QUEUE_PROMPT_TRUNCATION);
    lines.push("  " + state.queue.length + " prompt queued: " + peek);
  }
  const flickerBusy = agent.status === "busy" || (agent.status === "idle" && now - agent.lastIdleAt < FLICKER_DEBOUNCE_MS);
  if (flickerBusy) {
    lines.push("");
    lines.push("⠋ Working…");
  }
  if (lines.length > contentRows) return lines.slice(lines.length - contentRows);
  return padLines(lines, contentRows);
};

const padLines = (lines: string[], target: number): string[] => {
  const out = [...lines];
  while (out.length < target) out.push("");
  return out.slice(0, target);
};

const renderFooter = (state: TuiState, opts: RenderOptions, contentWidth: number): string[] => {
  const cwd = opts.cwd ?? "~";
  const branch = opts.branch ?? "";
  const left1 = branch === "" ? cwd : cwd + " (" + branch + ")";
  const focusedKey = state.focusedAgentId === null ? null : state.agents.get(state.focusedAgentId)?.agentKey;
  const right1 = state.teamId === null || focusedKey === null
    ? "no-team:—"
    : state.teamId + ":" + focusedKey;
  const stats = "0%/200k";
  const hint = state.showRail ? "ctl+↑↓ switch agent  ←← close agents" : "←← for agents";
  const model = opts.provider !== undefined && opts.modelId !== undefined && opts.provider !== "" && opts.modelId !== ""
    ? "(" + opts.provider + ") " + opts.modelId + (opts.effort !== undefined && opts.effort !== "" ? " | " + opts.effort : "")
    : "—";
  const line1 = truncate(left1, Math.max(0, contentWidth - visibleWidth(right1) - 2)) + "  " + right1;
  const statsBlock = stats + "  " + hint;
  const line2 = padRight(statsBlock, Math.max(0, contentWidth - visibleWidth(model) - 2)) + "  " + model;
  return [truncate(line1, contentWidth), truncate(line2, contentWidth)];
};

interface RenderedFrame {
  lines: string[];
}

export function render(state: TuiState, opts: RenderOptions, now: number): RenderedFrame {
  const cols = opts.cols;
  const rows = opts.rows;
  const showRail = state.showRail && state.agents.size > 0;
  const railCols = showRail ? railWidth(cols) : 0;
  const separatorCols = showRail ? 1 : 0;
  const chatCols = Math.max(0, cols - railCols - separatorCols);
  const editorHeight = Math.max(5, Math.floor(rows * 0.3)) + 2;
  const bodyHeight = Math.max(0, rows - editorHeight - 2);
  const railLines = showRail ? renderRail(state, railCols, bodyHeight, now) : [];
  const chatLines = renderChat(state, chatCols, bodyHeight, now);
  const merged: string[] = [];
  for (let i = 0; i < bodyHeight; i++) {
    const left = showRail ? (railLines[i] ?? "") : "";
    const sep = showRail ? VERTICAL_RULE : "";
    const right = chatLines[i] ?? "";
    if (showRail) {
      merged.push(padRight(left, railCols) + sep + right);
    } else {
      merged.push(right);
    }
  }
  const editorLines: string[] = [];
  editorLines.push(HORIZONTAL_RULE.repeat(cols));
  const placeholder = state.errorBanner !== null
    ? "[!] " + state.errorBanner.text
    : state.transientMessage !== null
      ? "> " + state.transientMessage.text
      : "type a prompt...";
  editorLines.push(placeholder);
  for (let i = editorLines.length; i < editorHeight - 1; i++) editorLines.push("");
  editorLines.push(HORIZONTAL_RULE.repeat(cols));
  while (editorLines.length < editorHeight) editorLines.push("");
  const footer = renderFooter(state, opts, cols);
  const result = [...merged, ...editorLines, ...footer];
  while (result.length < rows) result.push("");
  return { lines: result.slice(0, rows) };
};
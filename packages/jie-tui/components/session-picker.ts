import { SelectList, getKeybindings, truncateToWidth, type Component, type SelectItem, type SelectListTheme } from "@earendil-works/pi-tui";
import type { SessionSummary } from "@cuzfrog/jie-platform";
import { Actions, type StateStore } from "../state";
import { style } from "./themes";

const MAX_VISIBLE_SESSIONS = 10;

const PICKER_THEME: SelectListTheme = {
  selectedPrefix: style("accent"),
  selectedText: style("accent"),
  description: style("muted"),
  scrollInfo: style("muted"),
  noMatch: (_text: string) => style("muted")("  No matching sessions"),
};

export interface SessionPickerCallbacks {
  onSelect(sessionId: string): void;
  onCancel(): void;
}

export class SessionPicker implements Component {
  private readonly sessions: ReadonlyArray<SessionSummary>;
  private readonly stateStore: StateStore;
  private readonly callbacks: SessionPickerCallbacks;
  private readonly selectList: SelectList;

  constructor(sessions: ReadonlyArray<SessionSummary>, stateStore: StateStore, callbacks: SessionPickerCallbacks) {
    this.sessions = sessions;
    this.stateStore = stateStore;
    this.callbacks = callbacks;
    this.selectList = new SelectList(toItems(sessions), MAX_VISIBLE_SESSIONS, PICKER_THEME);
  }

  render(width: number): string[] {
    const w = Math.max(1, width);
    const lines = [
      truncateToWidth(style("accent")("Resume session (Esc close · Enter select · ↑↓ move · type to filter)"), w),
      truncateToWidth(style("muted")("filter: ") + this.stateStore.getState().sessionPickerQuery, w),
    ];
    lines.push(...this.selectList.render(w));
    return lines;
  }

  handleInput(data: string): void {
    const keys = getKeybindings();
    if (keys.matches(data, "tui.select.up")) {
      this.moveFocus(-1);
      return;
    }
    if (keys.matches(data, "tui.select.down")) {
      this.moveFocus(1);
      return;
    }
    if (keys.matches(data, "tui.select.confirm")) {
      this.selectFocused();
      return;
    }
    if (keys.matches(data, "tui.select.cancel")) {
      this.callbacks.onCancel();
      return;
    }
    if (data === "\x7f" || data === "\b") {
      this.setQuery(this.stateStore.getState().sessionPickerQuery.slice(0, -1));
      return;
    }
    if (isPrintable(data)) this.setQuery(this.stateStore.getState().sessionPickerQuery + data);
  }

  invalidate(): void {
    this.selectList.invalidate();
  }

  private setQuery(query: string): void {
    this.stateStore.dispatch(Actions.setPickerQuery(query));
    this.selectList.setFilter(query);
    this.selectList.setSelectedIndex(0);
  }

  private moveFocus(delta: 1 | -1): void {
    this.stateStore.dispatch(Actions.focusPickerIndex(delta, this.filtered().length));
    this.selectList.setSelectedIndex(this.stateStore.getState().sessionPickerFocus);
  }

  private selectFocused(): void {
    const session = this.filtered()[this.stateStore.getState().sessionPickerFocus];
    if (session !== undefined) this.callbacks.onSelect(session.sessionId);
  }

  private filtered(): ReadonlyArray<SessionSummary> {
    const query = this.stateStore.getState().sessionPickerQuery.toLowerCase();
    return this.sessions.filter((session) => session.sessionId.toLowerCase().startsWith(query));
  }
}

function toItems(sessions: ReadonlyArray<SessionSummary>): SelectItem[] {
  return sessions.map((session): SelectItem => ({
    value: session.sessionId,
    label: session.sessionId,
    description: `${session.messageCount} msg · ${relativeAge(session.lastActivity)}`,
  }));
}

function relativeAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

function isPrintable(data: string): boolean {
  if (data.startsWith("\x1b")) return false;
  const code = data.codePointAt(0);
  return code !== undefined && code >= 0x20;
}

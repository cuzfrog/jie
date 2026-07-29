import {
  Editor,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type EditorTheme,
  type TUI,
} from "@earendil-works/pi-tui";
import { Actions, type StateStore } from "../../state";
import { style } from "../themes";
import type { PromptHistoryStore } from "./prompt-history";

const ESCAPE = "\x1b";
const CTRL_C = "\x03";
const CTRL_D = "\x04";
const FAKE_CURSOR = "\x1b[7m";
const FAKE_CURSOR_END = "\x1b[0m";

const EDITOR_THEME: EditorTheme = {
  borderColor: style("border"),
  selectList: {
    selectedPrefix: style("accent"),
    selectedText: style("text"),
    description: style("muted"),
    scrollInfo: style("muted"),
    noMatch: style("muted"),
  },
};

export class JieEditor extends Editor {
  private readonly stateStore: StateStore;
  private readonly promptHistoryStore: PromptHistoryStore;
  private lastPersistedPrompt: string | null = null;
  private ghost: GhostSelection | null = null;

  constructor(
    tui: TUI,
    stateStore: StateStore,
    autocompleteProvider: AutocompleteProvider,
    promptHistoryStore: PromptHistoryStore,
    theme: EditorTheme = EDITOR_THEME,
  ) {
    super(tui, theme);
    this.stateStore = stateStore;
    this.promptHistoryStore = promptHistoryStore;
    const tracking = new GhostTrackingProvider(autocompleteProvider);
    tracking.onSuggestions = (items, prefix): void => {
      this.resetGhost(items, prefix);
    };
    this.setAutocompleteProvider(tracking);
    this.seedHistory();
    this.onChange = (text: string): void => {
      this.borderColor = text.startsWith("!") ? style("warning") : style("border");
      this.stateStore.dispatch(Actions.setEditorText(text));
      if (this.stateStore.getState().errorBanner !== null && text.length > 0) {
        this.stateStore.dispatch(Actions.clearBanners());
      }
    };
    this.onSubmit = (text: string): void => {
      if (text !== "") this.addToHistory(text);
      this.persistPrompt(text);
      this.stateStore.dispatch(Actions.submitEditorText(text));
    };
  }

  handleInput(data: string): void {
    if (data === ESCAPE && !this.isShowingAutocomplete()) {
      this.interruptFocusedAgent();
      return;
    }
    if (data === CTRL_C) {
      this.clearOrQuit();
      return;
    }
    if (data === CTRL_D && this.getText() === "") {
      this.stateStore.dispatch(Actions.requestQuit());
      return;
    }
    const navigating = this.isShowingAutocomplete() && this.ghost !== null && (matchesKey(data, "up") || matchesKey(data, "down"));
    super.handleInput(data);
    if (navigating) this.moveGhost(matchesKey(data, "down") ? 1 : -1);
    if (this.ghost !== null && !this.isShowingAutocomplete()) this.ghost = null;
  }

  render(width: number): string[] {
    const lines = super.render(width);
    if (this.ghost === null || !this.isShowingAutocomplete()) return lines;
    const suffix = ghostSuffix(this.ghost.prefix, this.ghost.items[this.ghost.index]?.value ?? "");
    if (suffix === "") return lines;
    const cursorLineIndex = lines.findIndex((line) => line.includes(FAKE_CURSOR));
    if (cursorLineIndex === -1) return lines;
    const injected = injectGhost(lines[cursorLineIndex], style("dim")(suffix), visibleWidth(suffix));
    if (injected === lines[cursorLineIndex]) return lines;
    const next = [...lines];
    next[cursorLineIndex] = injected;
    return next;
  }

  private seedHistory(): void {
    const entries = this.promptHistoryStore.load();
    for (const entry of entries) this.addToHistory(entry);
    this.lastPersistedPrompt = entries[entries.length - 1] ?? null;
  }

  private persistPrompt(text: string): void {
    const trimmed = text.trim();
    if (trimmed === "" || trimmed === this.lastPersistedPrompt) return;
    this.lastPersistedPrompt = trimmed;
    this.promptHistoryStore.append(trimmed);
  }

  private interruptFocusedAgent(): void {
    const state = this.stateStore.getState();
    if (state.teamId === null || state.focusedAgentId === null) return;
    const focused = state.agents.get(state.focusedAgentId);
    if (focused === undefined || focused.status !== "busy") return;
    this.stateStore.dispatch(Actions.requestInterrupt(focused.teamId, focused.agentKey));
  }

  private clearOrQuit(): void {
    if (this.getText() !== "") {
      this.setText("");
      return;
    }
    this.stateStore.dispatch(Actions.requestQuit());
  }

  private resetGhost(items: ReadonlyArray<AutocompleteItem>, prefix: string): void {
    this.ghost = items.length === 0 ? null : { items, prefix, index: bestMatchIndex(items, prefix) };
  }

  private moveGhost(direction: 1 | -1): void {
    if (this.ghost === null || this.ghost.items.length === 0) return;
    const count = this.ghost.items.length;
    this.ghost.index = (this.ghost.index + direction + count) % count;
  }
}

interface GhostSelection {
  readonly items: ReadonlyArray<AutocompleteItem>;
  readonly prefix: string;
  index: number;
}

class GhostTrackingProvider implements AutocompleteProvider {
  readonly triggerCharacters: string[] | undefined;
  onSuggestions: ((items: ReadonlyArray<AutocompleteItem>, prefix: string) => void) | null = null;
  private readonly inner: AutocompleteProvider;

  constructor(inner: AutocompleteProvider) {
    this.inner = inner;
    this.triggerCharacters = inner.triggerCharacters;
  }

  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    return Promise.resolve(this.inner.getSuggestions(lines, cursorLine, cursorCol, options)).then((result) => {
      if (result !== null && this.onSuggestions !== null) this.onSuggestions(result.items, result.prefix);
      return result;
    });
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    return this.inner.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
  }

  shouldTriggerFileCompletion(lines: string[], cursorLine: number, cursorCol: number): boolean {
    return this.inner.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
  }
}

function bestMatchIndex(items: ReadonlyArray<AutocompleteItem>, prefix: string): number {
  let firstPrefixIndex = -1;
  for (let i = 0; i < items.length; i++) {
    const value = items[i].value;
    if (value === prefix) return i;
    if (firstPrefixIndex === -1 && value.startsWith(prefix)) firstPrefixIndex = i;
  }
  return firstPrefixIndex === -1 ? 0 : firstPrefixIndex;
}

function ghostSuffix(prefix: string, value: string): string {
  if (value.startsWith(prefix)) return value.slice(prefix.length);
  if (prefix.startsWith("/") && value.startsWith(prefix.slice(1))) return value.slice(prefix.length - 1);
  return "";
}

function injectGhost(line: string, ghost: string, ghostWidth: number): string {
  const cursorStart = line.indexOf(FAKE_CURSOR);
  const cursorEnd = line.indexOf(FAKE_CURSOR_END, cursorStart);
  if (cursorStart === -1 || cursorEnd === -1) return line;
  const insertAt = cursorEnd + FAKE_CURSOR_END.length;
  const tail = line.slice(insertAt);
  if (!/^ *$/.test(tail)) return line;
  const fit = Math.min(ghostWidth, tail.length);
  if (fit <= 0) return line;
  const shown = fit === ghostWidth ? ghost : truncateToWidth(ghost, fit);
  return line.slice(0, insertAt) + shown + tail.slice(0, tail.length - fit);
}

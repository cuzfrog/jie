import {
  Editor,
  matchesKey,
  truncateToWidth,
  visibleWidth,
  type AutocompleteItem,
  type AutocompleteProvider,
  type EditorTheme,
  type TUI,
} from "@earendil-works/pi-tui";
import { Actions, TuiState, type StateStore } from "../../state";
import { type JieAutocompleteProvider, type JieSuggestions } from "../../autocomplete";
import { COMMAND_METADATA } from "../../command-metadata";
import { style } from "../themes";
import type { PromptHistoryStore } from "./prompt-history";

const ESCAPE = "\x1b";
const CTRL_C = "\x03";
const CTRL_D = "\x04";
const FAKE_CURSOR = "\x1b[7m";
const FAKE_CURSOR_END = "\x1b[0m";
const SCROLL_INFO_PATTERN = /^\s*\((\d+)\/(\d+)\)\s*$/;
const COMMAND_BOUNDARY_PATTERN = /^\/(\S+) $/;
const LEAD_ANSI_PATTERN = /^(\x1b\[[0-9;]*m)*/;
const SESSION_LABEL_TRAILING_DASHES = 2;
const HISTORY_MAX_SIZE = 100;
const CHIP_BACKGROUND_BORDER = "\x1b[44m";
const CHIP_BACKGROUND_WARNING = "\x1b[43m";
const CHIP_BACKGROUND_END = "\x1b[49m";

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
  private bashMode = false;
  private ghost: GhostSelection | null = null;
  private popupFilteredOut: number | null = null;
  private readonly historyMirror: string[] = [];
  private browse: QueueBrowse | null = null;
  private programmaticChange = false;

  constructor(
    tui: TUI,
    stateStore: StateStore,
    autocompleteProvider: JieAutocompleteProvider,
    promptHistoryStore: PromptHistoryStore,
    theme: EditorTheme = EDITOR_THEME,
  ) {
    super(tui, theme);
    this.stateStore = stateStore;
    this.promptHistoryStore = promptHistoryStore;
    const tracking = new GhostTrackingProvider(autocompleteProvider);
    tracking.onSuggestions = (suggestions): void => {
      this.popupFilteredOut = suggestions.filteredOut ?? null;
      this.resetGhost(suggestions.items, suggestions.prefix);
    };
    this.setAutocompleteProvider(tracking);
    this.seedHistory();
    this.onChange = (text: string): void => {
      if (!this.programmaticChange) this.browse = null;
      this.bashMode = text.startsWith("!");
      this.borderColor = this.bashMode ? style("warning") : style("border");
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
    if (this.tryBrowseNavigation(data)) return;
    const navigating = this.isShowingAutocomplete() && this.ghost !== null && (matchesKey(data, "up") || matchesKey(data, "down"));
    super.handleInput(data);
    if (navigating) this.moveGhost(matchesKey(data, "down") ? 1 : -1);
    if (this.ghost !== null && !this.isShowingAutocomplete()) this.ghost = null;
    if (!this.isShowingAutocomplete()) this.popupFilteredOut = null;
  }

  render(width: number): string[] {
    let lines = super.render(width);
    const chipBackground = this.bashMode ? CHIP_BACKGROUND_WARNING : CHIP_BACKGROUND_BORDER;
    lines = spliceSessionLabel(lines, this.stateStore.getState().sessionName, width, this.borderColor, chipBackground);
    if (this.isShowingAutocomplete() && this.popupFilteredOut !== null && this.ghost !== null) {
      lines = spliceFilteredInfo(lines, this.popupFilteredOut, this.ghost.index + 1, this.ghost.items.length);
    }
    const suffix = this.resolveGhostSuffix();
    if (suffix === "") return lines;
    const cursorLineIndex = lines.findIndex((line) => line.includes(FAKE_CURSOR));
    if (cursorLineIndex === -1) return lines;
    const injected = injectGhost(lines[cursorLineIndex], style("dim")(suffix), visibleWidth(suffix));
    if (injected === lines[cursorLineIndex]) return lines;
    const next = [...lines];
    next[cursorLineIndex] = injected;
    return next;
  }

  addToHistory(text: string): void {
    super.addToHistory(text);
    const trimmed = text.trim();
    if (trimmed === "" || this.historyMirror[0] === trimmed) return;
    this.historyMirror.unshift(trimmed);
    if (this.historyMirror.length > HISTORY_MAX_SIZE) this.historyMirror.pop();
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
    const focused = TuiState.getFocusedAgent(this.stateStore.getState());
    if (focused === null || focused.status !== "busy") return;
    this.stateStore.dispatch(Actions.requestInterrupt(focused.teamId, focused.agentKey));
  }

  private tryBrowseNavigation(data: string): boolean {
    if (this.isShowingAutocomplete()) return false;
    if (matchesKey(data, "up")) return this.tryBrowseUp();
    if (matchesKey(data, "down")) return this.tryBrowseDown();
    return false;
  }

  private tryBrowseUp(): boolean {
    if (this.getCursor().line !== 0) return false;
    if (this.browse === null && !this.startBrowse()) return false;
    const value = this.nextBrowseValue();
    if (value === null) return true;
    const session = this.browse!;
    session.stack.push(value);
    session.index += 1;
    this.applyBrowseText(value);
    return true;
  }

  private startBrowse(): boolean {
    const focused = TuiState.getFocusedAgent(this.stateStore.getState());
    const hasQueuedUserPrompt = focused !== null && focused.queue.some((entry) => entry.source === "user");
    if (!hasQueuedUserPrompt && this.historyMirror.length === 0) return false;
    const draft = this.getText();
    const trimmed = draft.trim();
    const pushed = trimmed !== "" && this.historyMirror[0] !== trimmed;
    if (trimmed !== "") this.addToHistory(draft);
    this.browse = { stack: [draft], index: 0, historyOffset: pushed ? 1 : 0, historySteps: 0 };
    return true;
  }

  private nextBrowseValue(): string | null {
    const focused = TuiState.getFocusedAgent(this.stateStore.getState());
    if (focused !== null) {
      for (let i = focused.queue.length - 1; i >= 0; i--) {
        const entry = focused.queue[i]!;
        if (entry.source !== "user") continue;
        this.stateStore.dispatch(Actions.requestDequeue(focused.teamId, focused.agentKey, entry.text));
        return entry.text;
      }
    }
    const session = this.browse!;
    const value = this.historyMirror[session.historyOffset + session.historySteps];
    if (value === undefined) return null;
    session.historySteps += 1;
    return value;
  }

  private tryBrowseDown(): boolean {
    const session = this.browse;
    if (session === null) return false;
    if (this.getCursor().line !== this.getLines().length - 1) return false;
    if (session.index === 0) return true;
    session.index -= 1;
    const value = session.stack[session.index]!;
    if (session.index === 0) this.browse = null;
    this.applyBrowseText(value);
    return true;
  }

  private applyBrowseText(text: string): void {
    this.programmaticChange = true;
    this.setText(text);
    this.programmaticChange = false;
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

  private resolveGhostSuffix(): string {
    if (this.ghost !== null && this.isShowingAutocomplete()) return ghostSuffix(this.ghost.prefix, this.ghost.items[this.ghost.index]);
    return commandBoundaryHint(this.getText());
  }
}

interface GhostSelection {
  readonly items: ReadonlyArray<AutocompleteItem>;
  readonly prefix: string;
  index: number;
}

interface QueueBrowse {
  readonly stack: string[];
  index: number;
  readonly historyOffset: number;
  historySteps: number;
}

class GhostTrackingProvider implements AutocompleteProvider {
  readonly triggerCharacters: string[] | undefined;
  onSuggestions: ((suggestions: JieSuggestions) => void) | null = null;
  private readonly inner: JieAutocompleteProvider;

  constructor(inner: JieAutocompleteProvider) {
    this.inner = inner;
    this.triggerCharacters = inner.triggerCharacters;
  }

  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<JieSuggestions | null> {
    return Promise.resolve(this.inner.getSuggestions(lines, cursorLine, cursorCol, options)).then((result) => {
      if (result !== null && this.onSuggestions !== null) this.onSuggestions(result);
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

function ghostSuffix(prefix: string, item: AutocompleteItem | undefined): string {
  if (item === undefined) return "";
  const suffix = valueRemainder(prefix, item.value);
  const hint = argumentHintOf(item.description);
  if (suffix === "" && hint === "") return "";
  return hint === "" ? suffix : `${suffix} ${hint}`;
}

function valueRemainder(prefix: string, value: string): string {
  if (value.startsWith(prefix)) return value.slice(prefix.length);
  if (prefix.startsWith("/") && value.startsWith(prefix.slice(1))) return value.slice(prefix.length - 1);
  return "";
}

function argumentHintOf(description: string | undefined): string {
  if (description === undefined) return "";
  const head = description.split(" — ")[0] ?? "";
  return head.startsWith("<") || head.startsWith("[") ? head : "";
}

function commandBoundaryHint(text: string): string {
  const match = COMMAND_BOUNDARY_PATTERN.exec(text);
  if (match === null) return "";
  const command = COMMAND_METADATA.find((entry) => entry.name === match[1]);
  return command?.argumentHint ?? "";
}

function injectGhost(line: string, ghost: string, ghostWidth: number): string {
  const cursorStart = line.indexOf(FAKE_CURSOR);
  const cursorEnd = line.indexOf(FAKE_CURSOR_END, cursorStart);
  if (cursorStart === -1 || cursorEnd === -1) return line;
  const cursorChar = line.slice(cursorStart + FAKE_CURSOR.length, cursorEnd);
  const tail = line.slice(cursorEnd + FAKE_CURSOR_END.length);
  if (!/^ *$/.test(tail)) return line;
  const before = line.slice(0, cursorStart);
  if (cursorChar.trim() !== "") {
    const fit = Math.min(ghostWidth, tail.length);
    if (fit <= 0) return line;
    const shown = fit === ghostWidth ? ghost : truncateToWidth(ghost, fit);
    return `${line.slice(0, cursorEnd + FAKE_CURSOR_END.length)}${shown}${tail.slice(0, tail.length - fit)}`;
  }
  const fit = Math.min(ghostWidth, tail.length + 1);
  const shown = fit === ghostWidth ? ghost : truncateToWidth(ghost, fit);
  const leadAnsi = LEAD_ANSI_PATTERN.exec(shown)![0];
  const point = shown.codePointAt(leadAnsi.length);
  if (point === undefined) return line;
  const first = String.fromCodePoint(point);
  const rest = shown.slice(leadAnsi.length + first.length);
  return `${before}${leadAnsi}${FAKE_CURSOR}${first}${FAKE_CURSOR_END}${leadAnsi}${rest}${tail.slice(fit - 1)}`;
}

function spliceSessionLabel(
  lines: string[],
  name: string | null,
  width: number,
  borderColor: (text: string) => string,
  chipBackground: string,
): string[] {
  if (name === null || name === "" || lines.length === 0) return lines;
  const maxNameWidth = width - SESSION_LABEL_TRAILING_DASHES - 3;
  if (maxNameWidth < 1) return lines;
  const shown = visibleWidth(name) > maxNameWidth ? truncateToWidth(name, maxNameWidth, "") : name;
  const label = ` ${shown} `;
  const start = width - SESSION_LABEL_TRAILING_DASHES - visibleWidth(label);
  const prefix = truncateToWidth(stripAnsi(lines[0]!), start, "");
  const next = [...lines];
  next[0] = borderColor(prefix) + chipBackground + label + CHIP_BACKGROUND_END + borderColor("─".repeat(SESSION_LABEL_TRAILING_DASHES));
  return next;
}

function spliceFilteredInfo(lines: string[], filteredOut: number, selected: number, total: number): string[] {
  const index = lines.findIndex((line) => SCROLL_INFO_PATTERN.test(stripAnsi(line)));
  if (index !== -1) {
    const match = SCROLL_INFO_PATTERN.exec(stripAnsi(lines[index]!))!;
    const next = [...lines];
    next[index] = style("muted")(`  (${match[1]}/${match[2]} | ${filteredOut} filtered)`);
    return next;
  }
  if (total === 0) return lines;
  return [...lines, style("muted")(`  (${selected}/${total} | ${filteredOut} filtered)`)];
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

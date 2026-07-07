import {
  CombinedAutocompleteProvider,
  Container,
  Editor,
  type AutocompleteItem,
  type SlashCommand,
  type TUI,
} from "@earendil-works/pi-tui";
import { Themes } from "./themes";
import { Actions, type StateStore } from "../state";

interface EditorSlotOptions {
  readonly basePath: string;
  readonly fdPath?: string | null;
  readonly commands?: ReadonlyArray<AutocompleteItem | SlashCommand>;
  readonly onSubmit?: (text: string) => void;
}

export class EditorSlot extends Container {
  private readonly editor: Editor;
  private readonly placeholderText: string;
  private queueIndicator: string | null;
  private stateStore: StateStore | null;

  constructor(tui: TUI, opts: EditorSlotOptions) {
    super();
    this.editor = new Editor(tui, Themes.editorTheme);
    this.placeholderText = "type a prompt...";
    this.queueIndicator = null;
    this.stateStore = null;
    const provider = new CombinedAutocompleteProvider(
      opts.commands === undefined ? undefined : [...opts.commands],
      opts.basePath,
      opts.fdPath ?? null,
    );
    this.editor.setAutocompleteProvider(provider);
    if (opts.onSubmit !== undefined) this.editor.onSubmit = opts.onSubmit;
    this.editor.onChange = (text): void => {
      this.stateStore?.dispatch(Actions.setEditorText(text));
    };
  }

  setText(text: string): void {
    this.editor.setText(text);
  }

  getText(): string {
    return this.editor.getText();
  }

  setQueueIndicator(text: string | null): void {
    this.queueIndicator = text;
  }

  bindState(stateStore: StateStore): void {
    this.stateStore = stateStore;
    const sync = (): void => {
      const target = stateStore.getState().editorText;
      if (target !== this.editor.getText()) this.editor.setText(target);
    };
    sync();
    stateStore.subscribe(sync);
  }

  handleInput(data: string): void {
    this.editor.handleInput(data);
  }

  render(width: number): string[] {
    const lines = this.editor.render(width);
    if (this.editor.getText() === "") {
      const dimPlaceholder = Themes.editorTheme.placeholder(this.placeholderText);
      const horizontal = Themes.editorTheme.borderColor("─".repeat(width));
      const innerRow = ` ${dimPlaceholder}${" ".repeat(Math.max(0, width - this.placeholderText.length - 1))}`;
      const rendered: string[] = [];
      rendered.push(horizontal);
      rendered.push(innerRow);
      if (lines.length >= 3) for (let i = 2; i < lines.length; i++) rendered.push(lines[i]!);
      else rendered.push(horizontal);
      const indicator: string[] = this.queueIndicator === null ? [] : [this.queueIndicator];
      return [...indicator, ...rendered];
    }
    const indicator: string[] = this.queueIndicator === null ? [] : [this.queueIndicator];
    return [...indicator, ...lines];
  }

  invalidate(): void {
    this.editor.invalidate();
  }
}
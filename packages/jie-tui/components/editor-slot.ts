import {
  CombinedAutocompleteProvider,
  Container,
  Editor,
  type AutocompleteItem,
  type SlashCommand,
  type TUI,
} from "@earendil-works/pi-tui";
import { editorTheme } from "./themes";

interface EditorSlotOptions {
  readonly basePath: string;
  readonly fdPath?: string | null;
  readonly commands?: ReadonlyArray<AutocompleteItem | SlashCommand>;
  readonly onSubmit?: (text: string) => void;
  readonly onChange?: (text: string) => void;
}

export class EditorSlot extends Container {
  private readonly editor: Editor;
  private readonly placeholderText: string;
  private queueIndicator: string | null;

  constructor(tui: TUI, opts: EditorSlotOptions) {
    super();
    this.editor = new Editor(tui, editorTheme);
    this.placeholderText = "type a prompt...";
    this.queueIndicator = null;
    const provider = new CombinedAutocompleteProvider(
      opts.commands === undefined ? undefined : [...opts.commands],
      opts.basePath,
      opts.fdPath ?? null,
    );
    this.editor.setAutocompleteProvider(provider);
    if (opts.onSubmit !== undefined) this.editor.onSubmit = opts.onSubmit;
    if (opts.onChange !== undefined) this.editor.onChange = opts.onChange;
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

  render(width: number): string[] {
    const lines = this.editor.render(width);
    const isEmpty = this.editor.getText() === "";
    const indicator: string[] = this.queueIndicator === null ? [] : [this.queueIndicator];
    if (!isEmpty) return [...indicator, ...lines];
    const firstLine = lines[0] ?? "";
    const rest = lines.slice(1);
    const body = firstLine === "" ? rest : [firstLine, ...rest];
    return [...indicator, this.placeholderText, ...body];
  }

  invalidate(): void {
    this.editor.invalidate();
  }
}

export function editorSlotFromCommands(tui: TUI, basePath: string, commands: ReadonlyArray<SlashCommand>): EditorSlot {
  return new EditorSlot(tui, { basePath, commands });
}
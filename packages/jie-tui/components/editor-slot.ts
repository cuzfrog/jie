import {
  CombinedAutocompleteProvider,
  Container,
  Editor,
  type AutocompleteItem,
  type SlashCommand,
  type TUI,
} from "@earendil-works/pi-tui";
import { editorTheme } from "./themes";

export interface EditorSlotOptions {
  readonly basePath: string;
  readonly fdPath?: string | null;
  readonly commands?: ReadonlyArray<AutocompleteItem | SlashCommand>;
  readonly onSubmit?: (text: string) => void;
  readonly onChange?: (text: string) => void;
}

export class EditorSlot extends Container {
  private readonly editor: Editor;
  private readonly placeholderText: string;

  constructor(tui: TUI, opts: EditorSlotOptions) {
    super();
    this.editor = new Editor(tui, editorTheme);
    this.placeholderText = "type a prompt...";
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

  render(width: number): string[] {
    const lines = this.editor.render(width);
    if (this.editor.getText() === "" && lines.length > 0) {
      return [this.placeholderText, ...lines.slice(1)];
    }
    return lines;
  }

  invalidate(): void {
    this.editor.invalidate();
  }
}

export function editorSlotFromCommands(tui: TUI, basePath: string, commands: ReadonlyArray<SlashCommand>): EditorSlot {
  return new EditorSlot(tui, { basePath, commands });
}

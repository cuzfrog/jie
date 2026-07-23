import { asFunction, type AwilixContainer } from "awilix";
import type { AutocompleteProvider, Editor, TUI } from "@earendil-works/pi-tui";
import type { StateStore } from "../../state";
import type { TuiCradle } from "../../container";
import { JieEditor } from "./jie-editor";

export function registerEditorModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    jieEditorFactory: asFunction((
      stateStore: StateStore,
      autocompleteProvider: AutocompleteProvider,
    ) =>
      (tui: TUI): Editor => new JieEditor(tui, stateStore, autocompleteProvider)
    ).singleton(),
  });
}

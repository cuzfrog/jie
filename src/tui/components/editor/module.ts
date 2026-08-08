import { join } from "node:path";
import { asFunction, type AwilixContainer } from "awilix";
import type { Editor, TUI } from "@earendil-works/pi-tui";
import type { JieAutocompleteProvider } from "../../autocomplete";
import type { StateStore } from "../../state";
import type { TuiCradle } from "../../container";
import { JieEditor } from "./jie-editor";
import { createPromptHistoryStore } from "./prompt-history";

const PROMPT_HISTORY_FILE = "prompt-history.jsonl";

export function registerEditorModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    jieEditorFactory: asFunction((
      stateStore: StateStore,
      autocompleteProvider: JieAutocompleteProvider,
      homeJieDir: string,
    ) => {
      const promptHistoryStore = createPromptHistoryStore(join(homeJieDir, PROMPT_HISTORY_FILE));
      return (tui: TUI): Editor => new JieEditor(tui, stateStore, autocompleteProvider, promptHistoryStore);
    }).singleton(),
  });
}

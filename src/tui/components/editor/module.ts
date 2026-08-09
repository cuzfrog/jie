import { join } from "node:path";
import { asClass, asFunction, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../../container";
import { JieEditor } from "./jie-editor";
import { createPromptHistoryStore } from "./prompt-history";

const PROMPT_HISTORY_FILE = "prompt-history.jsonl";

export function registerEditorModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    promptHistoryStore: asFunction((homeJieDir: string) =>
      createPromptHistoryStore(join(homeJieDir, PROMPT_HISTORY_FILE)),
    ).singleton(),
    editor: asClass(JieEditor).singleton(),
  });
}

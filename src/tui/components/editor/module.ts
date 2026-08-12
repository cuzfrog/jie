import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../../container";
import { JieEditor } from "./jie-editor";
import { PromptHistoryStoreImpl } from "./prompt-history";

export function registerEditorModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    promptHistoryStore: asClass(PromptHistoryStoreImpl).singleton(),
    editor: asClass(JieEditor).singleton(),
  });
}

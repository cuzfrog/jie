import { asFunction, asValue, type AwilixContainer } from "awilix";
import type { CommandCatalog, CommandResolver } from "../command";
import { scanFiles, type ScannedFile } from "../file-mention";
import type { StateStore } from "../state";
import type { TuiCradle } from "../container";
import { FileMentionSource } from "./file-mention-source";
import { JieAutocompleteProviderImpl } from "./jie-autocomplete";
import type { JieAutocompleteProvider } from "./jie-autocomplete";
import { PathCompletionSource } from "./path-completion-source";
import { SkillSource } from "./skill-source";
import { SlashCommandSource } from "./slash-command-source";

function createAutocompleteProvider(
  cwd: string,
  scan: (rootDir: string) => ReadonlyArray<ScannedFile>,
  commandRegistry: CommandCatalog,
  commandResolver: CommandResolver,
  stateStore: StateStore,
): JieAutocompleteProvider {
  return new JieAutocompleteProviderImpl(cwd, [
    new FileMentionSource(cwd, scan),
    new SlashCommandSource(commandRegistry, commandResolver, stateStore),
    new SkillSource(stateStore),
    new PathCompletionSource(cwd),
  ]);
}

export function registerAutocompleteModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    scan: asValue(scanFiles),
    autocompleteProvider: asFunction(createAutocompleteProvider).singleton(),
  });
}

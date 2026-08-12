import { asFunction, type AwilixContainer } from "awilix";
import { CombinedAutocompleteProvider } from "@earendil-works/pi-tui";
import type { CommandCatalog, CommandResolver } from "../command";
import { scanFiles } from "./list-files";
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
  commandRegistry: CommandCatalog,
  commandResolver: CommandResolver,
  stateStore: StateStore,
): JieAutocompleteProvider {
  const applier = new CombinedAutocompleteProvider([], cwd, null);
  return new JieAutocompleteProviderImpl([
    new FileMentionSource(cwd, scanFiles),
    new SlashCommandSource(commandRegistry, commandResolver, stateStore),
    new SkillSource(stateStore),
    new PathCompletionSource(new CombinedAutocompleteProvider([], cwd, null)),
  ], applier);
}

export function registerAutocompleteModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    autocompleteProvider: asFunction(createAutocompleteProvider).singleton(),
  });
}

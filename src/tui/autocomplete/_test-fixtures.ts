import type { JiePlatform, KanbanCard } from "../../platform";
import type { CommandCatalog, CommandMeta, CommandResolver } from "../command";
import { SLASH_COMMANDS } from "../command/definitions";
import { type ScannedFile } from "./list-files";
import type { StateStore, TuiState } from "../state";
import { makeTuiState } from "../test";
import { FileMentionSource } from "./file-mention-source";
import type { JieAutocompleteProvider } from "./jie-autocomplete";
import { JieAutocompleteProviderImpl } from "./jie-autocomplete";
import { PathCompletionSource } from "./path-completion-source";
import { SkillSource } from "./skill-source";
import { SlashCommandSource } from "./slash-command-source";

export const CWD = "/proj";

export const SCANNED_FILES: ReadonlyArray<ScannedFile> = [
  { absPath: "/proj/src/main.ts", relPath: "src/main.ts" },
  { absPath: "/proj/src/helper.ts", relPath: "src/helper.ts" },
];

export function scanFixture(_rootDir: string, _options?: { onlyIgnored?: boolean }): ReadonlyArray<ScannedFile> {
  return SCANNED_FILES;
}

export function noScan(_rootDir: string, _options?: { onlyIgnored?: boolean }): ReadonlyArray<ScannedFile> {
  return [];
}

export function signal(): AbortSignal {
  return new AbortController().signal;
}

export function makePlatform(execute: ReturnType<typeof vi.fn>): JiePlatform {
  return vi.mocked<JiePlatform>({
    settings: {},
    subscribe: vi.fn(() => () => undefined),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    dequeuePrompt: vi.fn(),
    requeuePrompt: vi.fn(),
    teams: vi.fn(() => []),
    execute,
    shutdown: vi.fn(),
  });
}

export function nullPlatform(): JiePlatform {
  return makePlatform(vi.fn(async () => null));
}

export function makeStateStore(state: TuiState = makeTuiState()): StateStore {
  return vi.mocked<StateStore>({
    getState: vi.fn(() => state),
    dispatch: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  });
}

export function storeWithTeam(): StateStore {
  return makeStateStore(makeTuiState({ teamId: "my-team" }));
}

export function storeWithKanban(cards: ReadonlyArray<KanbanCard> = []): StateStore {
  return makeStateStore(makeTuiState({ teamId: "my-team", kanbanBoard: cards }));
}

const commandsByName = new Map<string, typeof SLASH_COMMANDS[number]>();
const aliasToCanonical = new Map<string, string>();
for (const command of SLASH_COMMANDS) {
  commandsByName.set(command.meta.name, command);
  for (const alias of command.meta.aliases ?? []) {
    aliasToCanonical.set(alias, command.meta.name);
  }
}

export const commandCatalog: CommandCatalog = {
  metadata: SLASH_COMMANDS.map((command) => command.meta),
  commandMeta(name: string): CommandMeta | null {
    const canonical = aliasToCanonical.get(name) ?? name;
    return commandsByName.get(canonical)?.meta ?? null;
  },
};

export function makeCommandResolver(platform: JiePlatform): CommandResolver {
  return {
    resolve: vi.fn(),
    complete: vi.fn((state: TuiState, name: string, argumentText: string) => {
      const canonical = aliasToCanonical.get(name) ?? name;
      const command = commandsByName.get(canonical);
      if (command === undefined) return null;
      return command.complete(argumentText, { state, platform });
    }),
  };
}

export function makeJieAutocompleteProvider(
  cwd: string,
  scan: (rootDir: string) => ReadonlyArray<ScannedFile>,
  platform: JiePlatform,
  stateStore: StateStore,
): JieAutocompleteProvider {
  return new JieAutocompleteProviderImpl(cwd, [
    new FileMentionSource(cwd, scan),
    new SlashCommandSource(commandCatalog, makeCommandResolver(platform), stateStore),
    new SkillSource(stateStore),
    new PathCompletionSource(cwd),
  ]);
}

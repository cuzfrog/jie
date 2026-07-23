import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { AutocompleteProvider, Component, Container, Editor, Terminal, TUI } from "@earendil-works/pi-tui";
import type { JiePlatform } from "@cuzfrog/jie-platform";
import { Actions, registerStateModule, type StateStore } from "./state";
import { registerAutocompleteModule } from "./autocomplete";
import type { ScannedFile } from "./file-mention";
import { registerChatModule, type ChatMessages } from "./components/chat";
import { registerFooterModule } from "./components/footer";
import { registerEditorModule } from "./components/editor";
import { registerSyncModule, type ChatSync } from "./sync";
import { registerComponentsModule, type TuiView } from "./components";
import { registerTuiModule } from "./module";
import type { CommandHandler } from "./command-handler";
import type { CreateTUIOptions, Tui, TuiDeps, TuiStdout } from "./tui";

export interface TuiCradle {
  readonly cwd: string;
  readonly platform: JiePlatform;
  readonly scan: (rootDir: string) => ReadonlyArray<ScannedFile>;
  readonly stdin: NodeJS.ReadableStream | undefined;
  readonly stdout: TuiStdout | undefined;
  readonly stateStore: StateStore;
  readonly commandHandler: CommandHandler;
  readonly autocompleteProvider: AutocompleteProvider;
  readonly chatMessages: ChatMessages;
  readonly todoList: Component;
  readonly footer: Component;
  readonly jieEditorFactory: (tui: TUI) => Editor;
  readonly chatSyncFactory: (chatContainer: Container, requestRender: () => void) => ChatSync;
  readonly viewFactory: (tui: TUI) => TuiView;
  readonly terminalFactory: (stdin: NodeJS.ReadableStream, stdout: TuiStdout) => Terminal;
  readonly tui: Tui;
}

export function bootTui(options: CreateTUIOptions, deps: TuiDeps): AwilixContainer<TuiCradle> {
  if (process.stdin.isTTY !== true && deps.stdin === undefined) {
    throw new Error("TUI requires an interactive terminal; use `jie -p` for scripts.");
  }
  if (!isUtf8()) {
    throw new Error("TUI requires a UTF-8 locale; set LANG=en_US.UTF-8");
  }
  const container = createContainer<TuiCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    cwd: asValue(options.cwd),
    platform: asValue(deps.platform),
  });
  if (deps.stdin !== undefined) container.register("stdin", asValue(deps.stdin));
  if (deps.stdout !== undefined) container.register("stdout", asValue(deps.stdout));
  registerStateModule(container);
  registerAutocompleteModule(container);
  registerChatModule(container);
  registerFooterModule(container);
  registerEditorModule(container);
  registerSyncModule(container);
  registerComponentsModule(container);
  registerTuiModule(container);
  container.cradle.stateStore.dispatch(Actions.setEnvironment(options.cwd, deps.gitBranch ?? "", deps.gitDirty ?? false));
  return container;
}

function isUtf8(): boolean {
  return /utf-?8/i.test(process.env.LANG ?? process.env.LC_ALL ?? "");
}

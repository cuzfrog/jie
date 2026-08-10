import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { Component, Container, Editor, Terminal, TUI } from "@earendil-works/pi-tui";
import type { JiePlatform } from "../platform";
import { logger } from "../utils";
import { Actions, registerStateModule, type StateStore } from "./state";
import { registerAutocompleteModule, type JieAutocompleteProvider } from "./autocomplete";
import type { ScannedFile } from "./file-mention";
import { registerChatModule, type ChatMessages } from "./components/chat";
import { registerFooterModule } from "./components/footer";
import { registerEditorModule } from "./components/editor";
import { registerElementsModule } from "./components/elements";
import { registerPanelsModule } from "./components/panels";
import { registerSyncModule, type ChatSync } from "./sync";
import { registerComponentsModule, type TuiView } from "./components";
import { registerTuiModule } from "./module";
import type { CommandHandler } from "./command-handler";
import type { CommandResolver } from "./command-resolver";
import type { CreateTUIOptions, Tui, TuiDeps, TuiStdout } from "./tui";
import type { TuiRenderer } from "./renderer";
import type { TuiComponent } from "./tui-component";

const log = logger.getSubLogger({ name: "jie.tui.container" });

export interface TuiCradle {
  readonly cwd: string;
  readonly homeJieDir: string;
  readonly platform: JiePlatform;
  readonly scan: (rootDir: string) => ReadonlyArray<ScannedFile>;
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: TuiStdout;
  readonly useProcessTerminal: boolean;
  readonly stateStore: StateStore;
  readonly commandHandler: CommandHandler;
  readonly commandResolver: CommandResolver;
  readonly autocompleteProvider: JieAutocompleteProvider;
  readonly chatMessages: ChatMessages;
  readonly kanbanList: Component;
  readonly footer: Component;
  readonly welcomeBanner: TuiComponent;
  readonly statusLine: TuiComponent;
  readonly queuedPrompts: TuiComponent;
  readonly teamPanel: TuiComponent;
  readonly kanbanPanel: TuiComponent;
  readonly helpPanel: TuiComponent;
  readonly chatContainer: Container;
  readonly requestRender: () => void;
  readonly editor: Editor & TuiComponent;
  readonly chatSync: ChatSync;
  readonly terminal: Terminal;
  readonly screen: TUI;
  readonly view: TuiView;
  readonly renderer: TuiRenderer;
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
    homeJieDir: asValue(deps.homeJieDir),
    platform: asValue(deps.platform),
    useProcessTerminal: asValue(deps.stdin === undefined),
    stdin: asValue(deps.stdin ?? process.stdin),
    stdout: asValue(deps.stdout ?? process.stdout),
  });
  registerStateModule(container);
  registerAutocompleteModule(container);
  registerChatModule(container);
  registerFooterModule(container);
  registerEditorModule(container);
  registerSyncModule(container);
  registerElementsModule(container);
  registerPanelsModule(container);
  registerComponentsModule(container);
  registerTuiModule(container);
  container.cradle.stateStore.dispatch(
    Actions.setEnvironment(options.cwd, deps.gitBranch ?? "", deps.gitDirty ?? false, deps.version ?? ""),
  );
  void container.cradle.platform
    .execute({ name: "getTeamInfo" })
    .then((info) => container.cradle.stateStore.dispatch(Actions.setInstalledTeams(info.installed)))
    .catch((error) => log.warn(`failed to load installed teams: ${String(error)}`));
  return container;
}

function isUtf8(): boolean {
  return /utf-?8/i.test(process.env.LANG ?? process.env.LC_ALL ?? "");
}

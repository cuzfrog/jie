import type { JiePlatform } from "@cuzfrog/jie-platform";
import { type InterceptOutcome, type TuiInterceptDeps, intercepts } from "@cuzfrog/jie-platform/command";
import { Actions, type StateStore } from "./state";

type CommandOutcome =
  | { readonly kind: "reply"; readonly text: string }
  | { readonly kind: "error"; readonly text: string }
  | { readonly kind: "clearState" }
  | { readonly kind: "stop" };

interface SlashCommand {
  readonly name: string;
  readonly run: (args: ReadonlyArray<string>) => CommandOutcome;
}

export interface CommandHandlerDeps {
  readonly stateStore: StateStore;
  readonly platform: JiePlatform;
}

export interface TuiCommandHandler {
  readonly handle: (text: string) => void;
}

export function createTuiCommandHandler(deps: CommandHandlerDeps): TuiCommandHandler {
  const handle = (text: string): void => {
    deps.stateStore.dispatch(Actions.clearBanners());
    const parts = text.split(/\s+/);
    const rawName = parts[0]!;
    const name = rawName.startsWith("/") ? rawName.slice(1) : rawName;
    const args = parts.slice(1);

    if (intercepts.has(name)) {
      void runIntercepted(name, args, interceptDeps(deps)).then((outcome) => {
        if (outcome === null) return;
        if (outcome.kind === "reply") deps.stateStore.dispatch(Actions.setTransientMessage(outcome.text));
        else if (outcome.kind === "error") deps.stateStore.dispatch(Actions.setErrorMessage(outcome.text));
      });
      return;
    }

    runLocalCommand(text, deps);
  };

  return { handle };
}

function interceptDeps(deps: CommandHandlerDeps): TuiInterceptDeps {
  return {
    platform: deps.platform,
    onLoadTeamError: (_teamId, message) => {
      deps.stateStore.dispatch(Actions.setErrorMessage(message));
    },
  };
}

async function runIntercepted(name: string, args: ReadonlyArray<string>, deps: TuiInterceptDeps): Promise<InterceptOutcome> {
  const fn = intercepts.get(name);
  if (fn === undefined) return null;
  return fn(args, deps);
}

function runLocalCommand(text: string, deps: CommandHandlerDeps): void {
  const parts = text.split(/\s+/);
  const rawName = parts[0]!;
  const name = rawName.startsWith("/") ? rawName.slice(1) : rawName;
  const slashCommand = COMMANDS.get(name);
  if (slashCommand === undefined) {
    deps.stateStore.dispatch(Actions.setErrorMessage(`unknown slash command: ${rawName}`));
    return;
  }
  const outcome = slashCommand.run(parts.slice(1));
  switch (outcome.kind) {
    case "clearState":
      deps.stateStore.dispatch(Actions.clearTuiState());
      return;
    case "stop":
      deps.stateStore.dispatch(Actions.requestQuit());
      return;
    case "reply":
      deps.stateStore.dispatch(Actions.setTransientMessage(outcome.text));
      return;
    case "error":
      deps.stateStore.dispatch(Actions.setErrorMessage(outcome.text));
      return;
  }
}

const HELP_TEXT = "type a prompt...  /clear /help /exit /team /model /login /logout";

const helpCommand: SlashCommand = {
  name: "help",
  run: () => ({ kind: "reply", text: HELP_TEXT }),
};

const clearCommand: SlashCommand = {
  name: "clear",
  run: () => ({ kind: "clearState" }),
};

const exitCommand: SlashCommand = {
  name: "exit",
  run: () => ({ kind: "stop" }),
};

const COMMANDS: ReadonlyMap<string, SlashCommand> = new Map<string, SlashCommand>([
  [helpCommand.name, helpCommand],
  [clearCommand.name, clearCommand],
  [exitCommand.name, exitCommand],
]);

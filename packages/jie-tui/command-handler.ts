import { Actions, type Action, type TuiState } from "./state";

export type CommandOutcome =
  | { readonly kind: "reply"; readonly text: string }
  | { readonly kind: "error"; readonly text: string }
  | { readonly kind: "clearState" }
  | { readonly kind: "stop" };

export interface SlashCommand {
  readonly name: string;
  readonly run: (args: ReadonlyArray<string>) => CommandOutcome;
}

export interface CommandHandlerDeps {
  readonly getState: () => TuiState;
  readonly dispatch: (action: Action) => void;
  readonly requestQuit: () => void;
}

export interface TuiCommandHandler {
  handle: (text: string) => void;
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

const teamCommand: SlashCommand = {
  name: "team",
  run: (args) => {
    const argument = args[0];
    if (argument === undefined) {
      return { kind: "reply", text: "/team <id>: picker not wired in v0.2.0 MVP. Use `jie team <id>` then restart." };
    }
    if (argument === "--unset") {
      return { kind: "reply", text: "/team --unset: not wired in v0.2.0 MVP. Use `jie team --unset`." };
    }
    return {
      kind: "reply",
      text: `team '${argument}' is not installed; checked .jie/teams/${argument}/ and ~/.jie/teams/${argument}/`,
    };
  },
};

const loginCommand: SlashCommand = {
  name: "login",
  run: () => ({
    kind: "reply",
    text: "/login: provider picker not wired in v0.2.0 MVP. Use `jie login --provider <id> --api-key <key>` then restart.",
  }),
};

const logoutCommand: SlashCommand = {
  name: "logout",
  run: () => ({
    kind: "reply",
    text: "/logout: not wired in v0.2.0 MVP. Use `jie logout [<provider>].",
  }),
};

const modelCommand: SlashCommand = {
  name: "model",
  run: () => ({
    kind: "reply",
    text: "/model: not wired in v0.2.0 MVP. Use `jie model <provider>/<modelId>`.",
  }),
};

const COMMANDS: ReadonlyMap<string, SlashCommand> = new Map<string, SlashCommand>([
  [helpCommand.name, helpCommand],
  [clearCommand.name, clearCommand],
  [exitCommand.name, exitCommand],
  [teamCommand.name, teamCommand],
  [loginCommand.name, loginCommand],
  [logoutCommand.name, logoutCommand],
  [modelCommand.name, modelCommand],
]);

const UNKNOWN_REPLY = (name: string): CommandOutcome => ({
  kind: "error",
  text: `unknown slash command: ${name}`,
});

export function runCommand(input: string): CommandOutcome {
  const parts = input.split(/\s+/);
  const rawName = parts[0]!;
  const name = rawName.startsWith("/") ? rawName.slice(1) : rawName;
  const slashCommand = COMMANDS.get(name);
  if (slashCommand === undefined) return UNKNOWN_REPLY(rawName);
  return slashCommand.run(parts.slice(1));
}

export function createTuiCommandHandler(deps: CommandHandlerDeps): TuiCommandHandler {
  const handle = (text: string): void => {
    deps.dispatch(Actions.clearTransientMessage());
    const outcome = runCommand(text);
    switch (outcome.kind) {
      case "clearState":
        deps.dispatch(Actions.clearTuiState());
        return;
      case "stop":
        deps.requestQuit();
        return;
      case "reply":
        deps.dispatch(Actions.setTransientMessage(outcome.text));
        return;
      case "error":
        deps.dispatch(Actions.setErrorMessage(outcome.text));
        return;
    }
  };

  return { handle };
}
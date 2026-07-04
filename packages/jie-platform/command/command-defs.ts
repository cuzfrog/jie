import type { AuthStore, Scope, Settings, SettingsStore } from "../config";
import type { ModelRegistry } from "../config";
import type { TeamRegistry } from "../team";

export interface CommandDispatcher {
  (name: "print", args: PrintArgs): Promise<PrintResult>;
  (name: "login", args: LoginArgs): Promise<LoginResult>;
  (name: "logout", args: LogoutArgs): Promise<LogoutResult>;
  (name: "apiKey", args: ApiKeyArgs): Promise<ApiKeyResult>;
  (name: "model", args: ModelArgs): Promise<ModelResult>;
  (name: "team", args: TeamArgs): Promise<TeamResult>;
}

export interface PrintArgs {
  readonly instruction: string;
  readonly timeout: number;
  readonly json: boolean;
}

export type PrintResult =
  | { readonly kind: "ok" }
  | { readonly kind: "timeout" }
  | { readonly kind: "error"; readonly message: string };

export interface LoginArgs {
  readonly provider: string;
  readonly apiKey: string;
}

export interface LogoutArgs {
  readonly provider?: string;
}

export interface ApiKeyArgs {
  readonly apiKey: string;
}

export interface ModelArgs {
  readonly provider: string;
  readonly modelId: string;
}

export interface TeamArgs {
  readonly teamId?: string;
  readonly unset: boolean;
}

export type CommandResult = { readonly kind: "ok" } | { readonly kind: "error"; readonly message: string };

export type LoginResult = CommandResult;
export type LogoutResult = CommandResult;
export type ApiKeyResult = CommandResult;
export type ModelResult = CommandResult;
export type TeamResult = CommandResult;

export interface CommandDeps {
  readonly authStore: AuthStore;
  readonly settingsStore: SettingsStore;
  readonly teamRegistry: TeamRegistry;
  readonly modelRegistry: ModelRegistry;
  readonly defaultScope: Scope;
  readonly settingsLoad: () => Settings;
}

export interface CommandDefs {
  readonly print: { readonly args: PrintArgs; readonly result: PrintResult };
  readonly login: { readonly args: LoginArgs; readonly result: LoginResult };
  readonly logout: { readonly args: LogoutArgs; readonly result: LogoutResult };
  readonly apiKey: { readonly args: ApiKeyArgs; readonly result: ApiKeyResult };
  readonly model: { readonly args: ModelArgs; readonly result: ModelResult };
  readonly team: { readonly args: TeamArgs; readonly result: TeamResult };
}

export type CommandName = keyof CommandDefs;

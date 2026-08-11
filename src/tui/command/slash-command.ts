import type { Command, JiePlatform } from "../../platform";
import type { TuiState } from "../state";

export interface CommandMeta {
  readonly name: string;
  readonly description: string;
  readonly argumentHint?: string;
  readonly aliases?: ReadonlyArray<string>;
  readonly arguments?: ReadonlyArray<ArgumentSpec>;
}

export interface ArgumentSpec {
  readonly name: string;
  readonly optional?: boolean;
  readonly greedy?: boolean;
}

export type UiAction = "clearState" | "showHelp" | "stop" | "cycleKanbanView";

export type ResolvedCommand =
  | { readonly kind: "ui"; readonly action: UiAction }
  | { readonly kind: "reply"; readonly text: string }
  | { readonly kind: "platform"; readonly slashName: string; readonly command: Command; readonly transient?: string }
  | { readonly kind: "error"; readonly text: string };

export interface SlashContext {
  readonly state: TuiState;
  readonly platform: JiePlatform;
}

export interface SlashCompletionItem {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
}

export interface SlashCompletion {
  readonly items: ReadonlyArray<SlashCompletionItem>;
  readonly filteredOut?: number;
}

export interface SlashArgument {
  readonly spec: ArgumentSpec;
  complete(prefix: string, context: SlashContext): SlashCompletion | Promise<SlashCompletion | null> | null;
}

export interface SlashCommandDefinition {
  readonly meta: CommandMeta;
  resolve(context: SlashContext, args: ReadonlyArray<string>): ResolvedCommand | Promise<ResolvedCommand>;
  complete(argumentText: string, context: SlashContext): SlashCompletion | Promise<SlashCompletion | null> | null;
}

export const MAX_SUGGESTIONS = 20;

export function hasPrefix(value: string, prefix: string): boolean {
  return value.toLowerCase().startsWith(prefix.toLowerCase());
}

export function isAlreadyComplete(candidates: ReadonlyArray<string>, prefix: string): boolean {
  return prefix !== "" && candidates.some((candidate) => candidate.toLowerCase() === prefix.toLowerCase());
}

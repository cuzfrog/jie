export type CommandOutcome =
  | { readonly kind: "reply"; readonly text: string }
  | { readonly kind: "error"; readonly text: string }
  | { readonly kind: "clearState" }
  | { readonly kind: "stop" };

export interface SlashCommand {
  readonly name: string;
  readonly run: (args: ReadonlyArray<string>) => CommandOutcome;
}

export interface CommandMeta {
  readonly name: string;
  readonly description: string;
  readonly argumentHint?: string;
}

export const COMMAND_METADATA: ReadonlyArray<CommandMeta> = [
  { name: "help", description: "show this help" },
  { name: "clear", description: "clear the conversation" },
  { name: "exit", description: "quit jie" },
  { name: "login", description: "store a provider API key", argumentHint: "<provider> <apiKey>" },
  { name: "logout", description: "remove one or all API keys", argumentHint: "[<provider>]" },
  { name: "model", description: "set the default model", argumentHint: "<provider/modelId>" },
  { name: "effort", description: "set the default thinking effort", argumentHint: "<level>" },
  { name: "team", description: "switch the active team", argumentHint: "<teamId>" },
  { name: "resume", description: "resume a session of the loaded team", argumentHint: "<sessionId>" },
  { name: "rename", description: "name the active session", argumentHint: "<name>" },
];

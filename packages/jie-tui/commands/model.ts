import type { SlashCommand } from "./types";

export const modelCommand: SlashCommand = {
  name: "model",
  run: () => ({
    kind: "reply",
    text: "/model: not wired in v0.2.0 MVP. Use `jie model <provider>/<modelId>`.",
  }),
};

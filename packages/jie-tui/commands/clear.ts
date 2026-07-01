import type { SlashCommand } from "./types";

export const clearCommand: SlashCommand = {
  name: "clear",
  run: () => ({ kind: "clearState" }),
};

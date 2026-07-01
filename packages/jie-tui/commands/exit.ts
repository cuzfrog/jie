import type { SlashCommand } from "./types";

export const exitCommand: SlashCommand = {
  name: "exit",
  run: () => ({ kind: "stop" }),
};

import type { SlashCommand } from "./types";

export const helpCommand: SlashCommand = {
  name: "help",
  run: () => ({
    kind: "reply",
    text: "type a prompt...  /clear /help /exit /team /model /login /logout",
  }),
};

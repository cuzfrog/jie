import type { SlashCommand } from "./types";

export const logoutCommand: SlashCommand = {
  name: "logout",
  run: () => ({
    kind: "reply",
    text: "/logout: not wired in v0.2.0 MVP. Use `jie logout [<provider>].",
  }),
};

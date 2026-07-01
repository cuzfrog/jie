import type { SlashCommand } from "./types";

export const loginCommand: SlashCommand = {
  name: "login",
  run: () => ({
    kind: "reply",
    text: "/login: provider picker not wired in v0.2.0 MVP. Use `jie login --provider <id> --api-key <key>` then restart.",
  }),
};

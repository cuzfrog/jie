import type { SlashCommand } from "./types";

const NOT_INSTALLED = (argument: string): string =>
  `team '${argument}' is not installed; checked .jie/teams/${argument}/ and ~/.jie/teams/${argument}/`;

export const teamCommand: SlashCommand = {
  name: "team",
  run: (args) => {
    const argument = args[0];
    if (argument === undefined) {
      return { kind: "reply", text: "/team <id>: picker not wired in v0.2.0 MVP. Use `jie team <id>` then restart." };
    }
    if (argument === "--unset") {
      return { kind: "reply", text: "/team --unset: not wired in v0.2.0 MVP. Use `jie team --unset`." };
    }
    return { kind: "reply", text: NOT_INSTALLED(argument) };
  },
};

export type BashContextMode = "with" | "exclude";

export interface BashCommand {
  readonly mode: BashContextMode;
  readonly command: string;
}

const BASH_DIRECTIVE_PREFIX =
  "Run the following shell command via the bash tool and report the output verbatim without paraphrasing, " +
  "commentary, or surrounding prose: ";
const BASH_EXCLUDE_DIRECTIVE_PREFIX =
  "Run the following shell command via the bash tool, report the output verbatim, " +
  "and do NOT include the command or its output in the conversation context: ";

export function parseBashCommand(rawText: string): BashCommand | null {
  const text = rawText.trimStart();
  if (!text.startsWith("!")) return null;
  if (text === "!") return null;
  if (text === "!!") return null;
  const exclude = text.startsWith("!!");
  const body = exclude ? text.slice(2) : text.slice(1);
  const command = body.trim();
  if (command.length === 0) return null;
  return { mode: exclude ? "exclude" : "with", command };
}

export function bashDirective(command: BashCommand): string {
  return (command.mode === "exclude" ? BASH_EXCLUDE_DIRECTIVE_PREFIX : BASH_DIRECTIVE_PREFIX) + command.command;
}

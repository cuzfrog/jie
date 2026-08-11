import { EFFORT_LEVELS, isEffortLevel } from "../../../platform";
import { PositionalSlashCommand } from "../positional-slash-command";
import { completeItems, type ResolvedCommand, type SlashCompletion, type SlashContext, type SlashCompletionItem } from "../slash-command";

const META = { name: "effort", description: "set the thinking effort", argumentHint: "<level>", arguments: [{ name: "level", optional: true }] } as const;

const EFFORT_ITEMS: ReadonlyArray<SlashCompletionItem> = EFFORT_LEVELS.map((level) => ({ value: level, label: level }));

export class EffortCommand extends PositionalSlashCommand {
  constructor() {
    super(META);
  }

  protected override executeParsed(context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand | Promise<ResolvedCommand> {
    const level = parsed.level;
    if (level === undefined) return this.queryDefaultEffort(context);
    if (!isEffortLevel(level)) return { kind: "error", text: `/effort: invalid '${level}' (expected off | low | medium | high | max)` };
    return { kind: "platform", slashName: "effort", command: { name: "setDefaultEffort", effort: level }, transient: `effort set to ${level}` };
  }

  protected override completeArgument(argumentText: string, _context: SlashContext): SlashCompletion | null {
    return completeItems(EFFORT_ITEMS, argumentText.trim());
  }

  private async queryDefaultEffort(context: SlashContext): Promise<ResolvedCommand> {
    try {
      const effort = await context.platform.execute({ name: "getDefaultEffort" });
      return { kind: "reply", text: `default effort: ${effort}` };
    } catch (error) {
      return { kind: "error", text: formatError("effort", error) };
    }
  }
}

function formatError(slashName: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `/${slashName} failed: ${reason}`;
}

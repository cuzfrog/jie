import { PositionalSlashCommand } from "../positional-slash-command";
import { completeItems, type ResolvedCommand, type SlashCompletion, type SlashContext } from "../slash-command";

const META = {
  name: "setting",
  description: "configure display settings",
  argumentHint: "<diff-block-expand|thinking-block-expand> <on|off>",
  arguments: [{ name: "key" }, { name: "value" }],
} as const;

const SETTING_ITEMS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "diff-block-expand", label: "diff-block-expand" },
  { value: "thinking-block-expand", label: "thinking-block-expand" },
];

const VALUE_ITEMS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "on", label: "on" },
  { value: "off", label: "off" },
];

export class SettingCommand extends PositionalSlashCommand {
  constructor() {
    super(META);
  }

  protected override executeParsed(_context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    const key = parsed.key;
    const value = parsed.value;
    if (key === undefined || value === undefined) return this.usageError();
    if (key !== "diff-block-expand" && key !== "thinking-block-expand") return this.usageError();
    if (value !== "on" && value !== "off") return this.usageError();
    const expanded = value === "on";
    const stateKey = key === "diff-block-expand" ? "toolCardsExpanded" : "thinkingExpanded";
    return { kind: "set", key: stateKey, value: expanded };
  }

  override complete(argumentText: string, _context: SlashContext): SlashCompletion | null {
    const trimmed = argumentText.trim();
    const parts = trimmed === "" ? [] : trimmed.split(/\s+/);
    if (parts.length === 0 || (parts.length === 1 && !argumentText.endsWith(" "))) {
      return completeItems(SETTING_ITEMS, parts[0] ?? "");
    }
    return completeItems(VALUE_ITEMS, parts[1] ?? "");
  }
}

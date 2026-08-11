import { EnumArgument } from "../arguments/enum-argument";
import { PositionalSlashCommand } from "../positional-slash-command";
import type { ResolvedCommand, SlashCompletion, SlashContext } from "../slash-command";

const META = { name: "notification", description: "toggle notification settings", argumentHint: "sound enable|disable", arguments: [{ name: "subcommand" }, { name: "value" }] } as const;

const SUBCOMMAND_ITEMS = [{ value: "sound", label: "sound" }] as const;
const VALUE_ITEMS = [
  { value: "enable", label: "enable" },
  { value: "disable", label: "disable" },
] as const;

export class NotificationCommand extends PositionalSlashCommand {
  private readonly subcommandArgument: EnumArgument;
  private readonly valueArgument: EnumArgument;

  constructor() {
    const subcommandArgument = new EnumArgument({ name: "subcommand" }, SUBCOMMAND_ITEMS);
    const valueArgument = new EnumArgument({ name: "value" }, VALUE_ITEMS);
    super(META, [subcommandArgument, valueArgument]);
    this.subcommandArgument = subcommandArgument;
    this.valueArgument = valueArgument;
  }

  protected override executeParsed(_context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    const subcommand = parsed.subcommand;
    const value = parsed.value;
    if (subcommand !== "sound") return { kind: "error", text: "/notification sound enable|disable" };
    if (value !== "enable" && value !== "disable") return { kind: "error", text: "/notification sound enable|disable" };
    const enabled = value === "enable";
    return { kind: "platform", slashName: "notification sound", command: { name: "setNotificationSoundEnabled", enabled }, transient: `sound notifications ${enabled ? "enabled" : "disabled"}` };
  }

  override complete(argumentText: string, context: SlashContext): SlashCompletion | null {
    const trimmed = argumentText.trim();
    const spaceIndex = trimmed.indexOf(" ");
    if (spaceIndex === -1) {
      const subcommand = trimmed.toLowerCase();
      if (subcommand === "sound") return this.completeValue("", context);
      if (subcommand !== "") return null;
      return this.subcommandArgument.complete(trimmed, context);
    }
    const subcommand = trimmed.slice(0, spaceIndex).toLowerCase();
    const rest = trimmed.slice(spaceIndex + 1).trim();
    if (subcommand !== "sound" || rest.includes(" ")) return null;
    return this.completeValue(rest, context);
  }

  private completeValue(rest: string, context: SlashContext): SlashCompletion | null {
    const completion = this.valueArgument.complete(rest, context);
    if (completion === null) return null;
    return { items: completion.items.map((item) => ({ ...item, value: `sound ${item.value}` })) };
  }
}

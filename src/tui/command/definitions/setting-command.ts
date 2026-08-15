import { PositionalSlashCommand } from "../positional-slash-command";
import { completeItems, type ResolvedCommand, type SlashCompletion, type SlashContext, type SlashCompletionItem } from "../slash-command";

const META = {
  name: "setting",
  description: "configure display settings",
  argumentHint: "<diff-block-expand|thinking-block-expand> <on|off>",
  arguments: [{ name: "key" }, { name: "value" }],
} as const;

const SETTING_KEYS = ["diff-block-expand", "thinking-block-expand"] as const;

const VALUE_ITEMS: ReadonlyArray<SlashCompletionItem> = [
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
    if (!isSettingKey(key)) return this.usageError();
    if (value !== "on" && value !== "off") return this.usageError();
    const expanded = value === "on";
    return { kind: "set", key: stateKey(key), value: expanded };
  }

  override complete(argumentText: string, context: SlashContext): SlashCompletion | null {
    const trimmed = argumentText.trim();
    const parts = trimmed === "" ? [] : trimmed.split(/\s+/);
    if (parts.length === 0 || (parts.length === 1 && !argumentText.endsWith(" "))) {
      return completeItems(settingItems(context.state), parts[0] ?? "");
    }
    const key = parts[0] ?? "";
    const current = isSettingKey(key) ? currentValue(context.state, key) : null;
    const items = valueItems(current);
    return completeItems(items, parts[1] ?? "");
  }
}

function isSettingKey(key: string): key is typeof SETTING_KEYS[number] {
  return SETTING_KEYS.some((settingKey) => settingKey === key);
}

function stateKey(key: typeof SETTING_KEYS[number]): "toolCardsExpanded" | "thinkingExpanded" {
  return key === "diff-block-expand" ? "toolCardsExpanded" : "thinkingExpanded";
}

function currentValue(state: SlashContext["state"], key: typeof SETTING_KEYS[number]): boolean {
  return state[stateKey(key)];
}

function settingItems(state: SlashContext["state"]): ReadonlyArray<SlashCompletionItem> {
  return SETTING_KEYS.map((key) => ({
    value: key,
    label: key,
    description: `current: ${currentValue(state, key) ? "on" : "off"}`,
  }));
}

function valueItems(current: boolean | null): ReadonlyArray<SlashCompletionItem> {
  const status = current === null ? "" : `current: ${current ? "on" : "off"}`;
  return VALUE_ITEMS.map((item) => ({
    ...item,
    description: `<on|off>${status === "" ? "" : ` — ${status}`}`,
  }));
}

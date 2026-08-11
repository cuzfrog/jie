import { hasPrefix, isAlreadyComplete, MAX_SUGGESTIONS, type ArgumentSpec, type SlashCompletionItem, type SlashArgument, type SlashCompletion, type SlashContext } from "../slash-command";

export class EnumArgument implements SlashArgument {
  readonly spec: ArgumentSpec;
  private readonly items: ReadonlyArray<SlashCompletionItem>;

  constructor(spec: ArgumentSpec, items: ReadonlyArray<SlashCompletionItem>) {
    this.spec = spec;
    this.items = items;
  }

  complete(prefix: string, _context: SlashContext): SlashCompletion | null {
    if (isAlreadyComplete(this.items.map((item) => item.value), prefix)) return null;
    const matches = this.items.filter((item) => hasPrefix(item.value, prefix)).slice(0, MAX_SUGGESTIONS);
    return matches.length === 0 ? null : { items: matches };
  }
}

import { TuiState } from "../state";
import { hasPrefix, isAlreadyComplete, MAX_SUGGESTIONS, type CommandMeta, type ResolvedCommand, type SlashArgument, type SlashCommandDefinition, type SlashCompletion, type SlashContext } from "./slash-command";

export abstract class PositionalSlashCommand implements SlashCommandDefinition {
  readonly meta: CommandMeta;
  private readonly args: ReadonlyArray<SlashArgument>;

  constructor(meta: CommandMeta, args: ReadonlyArray<SlashArgument>) {
    this.meta = meta;
    this.args = args;
  }

  resolve(context: SlashContext, args: ReadonlyArray<string>): ResolvedCommand | Promise<ResolvedCommand> {
    const parsed = parseArguments(args, this.args);
    if (parsed === null) return this.usageError();
    return this.executeParsed(context, parsed);
  }

  complete(argumentText: string, context: SlashContext): SlashCompletion | Promise<SlashCompletion | null> | null {
    if (this.args.length === 0) return null;
    if (this.args.length === 1) return this.completeFirst(argumentText, context, this.args[0]!);
    return null;
  }

  protected abstract executeParsed(context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand | Promise<ResolvedCommand>;

  protected usageError(): ResolvedCommand {
    const hint = this.meta.argumentHint === undefined ? "" : ` ${this.meta.argumentHint}`;
    return { kind: "error", text: `/${this.meta.name}${hint}` };
  }

  protected focusedTeamId(context: SlashContext): string | null {
    return context.state.teamId;
  }

  protected focusedAgentRoute(context: SlashContext): { readonly teamId: string; readonly agentKey: string } | null {
    const focused = TuiState.getFocusedAgent(context.state);
    if (focused !== null) return { teamId: focused.teamId, agentKey: focused.agentKey };
    const leaderId = context.state.leaderAgentId;
    if (leaderId === null) return null;
    const leader = context.state.agents.get(leaderId) ?? null;
    return leader === null ? null : { teamId: leader.teamId, agentKey: leader.agentKey };
  }

  private async completeFirst(argumentText: string, context: SlashContext, argument: SlashArgument): Promise<SlashCompletion | null> {
    const completion = await Promise.resolve(argument.complete(argumentText, context));
    if (completion === null) return null;
    const items = completion.items.slice(0, MAX_SUGGESTIONS);
    if (isAlreadyComplete(items.map((item) => item.value), argumentText)) return null;
    return { ...completion, items };
  }
}

function parseArguments(args: ReadonlyArray<string>, argumentsList: ReadonlyArray<SlashArgument>): Record<string, string | undefined> | null {
  if (argumentsList.length === 0) return args.length === 0 ? {} : null;
  const values: Record<string, string | undefined> = {};
  let remaining = [...args];
  for (const argument of argumentsList) {
    const spec = argument.spec;
    if (remaining.length === 0) {
      if (!spec.optional) return null;
      values[spec.name] = undefined;
      continue;
    }
    if (spec.greedy) {
      values[spec.name] = remaining.join(" ");
      remaining = [];
    } else {
      values[spec.name] = remaining.shift()!;
    }
  }
  return remaining.length === 0 ? values : null;
}

export function prefixItems(items: ReadonlyArray<{ readonly value: string; readonly label: string; readonly description?: string }>, prefix: string): ReadonlyArray<{ readonly value: string; readonly label: string; readonly description?: string }> {
  if (prefix === "") return items;
  return items.map((item) => ({ ...item, value: `${prefix}${item.value}` }));
}

export function matchByPrefix(items: ReadonlyArray<{ readonly value: string }>, prefix: string): ReadonlyArray<{ readonly value: string }> {
  if (prefix === "") return items;
  return items.filter((item) => hasPrefix(item.value, prefix));
}

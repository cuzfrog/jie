import { TuiState } from "../state";
import type { ArgumentSpec, CommandMeta, ResolvedCommand, SlashCommandDefinition, SlashCompletion, SlashContext } from "./slash-command";

export abstract class PositionalSlashCommand implements SlashCommandDefinition {
  readonly meta: CommandMeta;

  constructor(meta: CommandMeta) {
    this.meta = meta;
  }

  resolve(context: SlashContext, args: ReadonlyArray<string>): ResolvedCommand | Promise<ResolvedCommand> {
    const parsed = parseArguments(args, this.meta.arguments ?? []);
    if (parsed === null) return this.usageError();
    return this.executeParsed(context, parsed);
  }

  complete(argumentText: string, context: SlashContext): SlashCompletion | Promise<SlashCompletion | null> | null {
    const argumentCount = this.meta.arguments?.length ?? 0;
    if (argumentCount !== 1) return null;
    return this.completeArgument(argumentText, context);
  }

  protected completeArgument(_argumentText: string, _context: SlashContext): SlashCompletion | Promise<SlashCompletion | null> | null {
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
}

function parseArguments(args: ReadonlyArray<string>, argumentsList: ReadonlyArray<ArgumentSpec>): Record<string, string | undefined> | null {
  if (argumentsList.length === 0) return args.length === 0 ? {} : null;
  const values: Record<string, string | undefined> = {};
  let remaining = [...args];
  for (const spec of argumentsList) {
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

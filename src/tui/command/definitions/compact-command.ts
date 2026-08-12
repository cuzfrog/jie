import { TuiState } from "../../state";
import { PositionalSlashCommand } from "../positional-slash-command";
import type { ResolvedCommand, SlashContext } from "../slash-command";

const META = { name: "compact", description: "compact the conversation of the focused agent" } as const;

export class CompactCommand extends PositionalSlashCommand {
  constructor() {
    super(META);
  }

  protected override executeParsed(context: SlashContext, _parsed: Record<string, string | undefined>): ResolvedCommand {
    const focused = TuiState.getFocusedAgent(context.state);
    if (focused !== null && focused.status === "busy") {
      return { kind: "error", text: "wait for the current response to finish before compacting" };
    }
    const route = this.focusedAgentRoute(context);
    if (route === null) return { kind: "error", text: "/compact: no focused agent" };
    return { kind: "platform", slashName: "compact", command: { name: "compact", teamId: route.teamId, agentKey: route.agentKey }, transient: "compacting conversation..." };
  }
}

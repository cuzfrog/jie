import { TuiState } from "../../state";
import { PositionalSlashCommand } from "../positional-slash-command";
import type { ResolvedCommand, SlashContext } from "../slash-command";

const META = { name: "reload", description: "reload settings, manifests, and context files" } as const;

export class ReloadCommand extends PositionalSlashCommand {
  constructor() {
    super(META, []);
  }

  protected override executeParsed(context: SlashContext, _parsed: Record<string, string | undefined>): ResolvedCommand {
    if (TuiState.isBusy(context.state)) return { kind: "error", text: "wait for the current response to finish before reloading" };
    return { kind: "platform", slashName: "reload", command: { name: "reload" }, transient: "reloaded settings, manifests, and context files" };
  }
}

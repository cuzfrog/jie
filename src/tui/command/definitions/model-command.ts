import { parseModelRef } from "../../../platform";
import { ModelRefArgument } from "../arguments/model-ref-argument";
import { PositionalSlashCommand } from "../positional-slash-command";
import type { ResolvedCommand, SlashContext } from "../slash-command";

const META = { name: "model", description: "set the default model", argumentHint: "<provider>/<modelId>", arguments: [{ name: "modelRef" }] } as const;

export class ModelCommand extends PositionalSlashCommand {
  constructor() {
    super(META, [new ModelRefArgument()]);
  }

  protected override executeParsed(_context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    const modelRef = parsed.modelRef;
    if (modelRef === undefined) return this.usageError();
    const parsedModel = parseModelRef(modelRef);
    if (parsedModel === null) return { kind: "error", text: `/model: invalid '${modelRef}' (expected <provider>/<modelId>)` };
    return {
      kind: "platform",
      slashName: "model",
      command: { name: "setDefaultModel", provider: parsedModel.provider, id: parsedModel.modelId },
      transient: `default model set to ${parsedModel.provider}/${parsedModel.modelId}`,
    };
  }
}

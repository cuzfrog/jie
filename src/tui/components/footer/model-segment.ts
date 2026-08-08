import type { ModelInfo } from "../../../platform";
import { style } from "../themes";

export function formatModelSegment(model: ModelInfo): string {
  return `${style("muted")(`(${model.provider}) `)}${style("accent")(model.id)}${style("muted")(` | ${model.effort}`)}`;
}

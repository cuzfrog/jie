import type { ModelInfo } from "@cuzfrog/jie-platform";
import { style } from "../themes";

export function formatModelSegment(model: ModelInfo): string {
  return `${style("muted")(`(${model.provider}) `)}${style("accent")(model.id)}${style("muted")(` | ${model.effort}`)}`;
}

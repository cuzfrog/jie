import type { ModelInfo } from "../../../platform";
import { style } from "../themes";

export interface ModelSegment {
  format(model: ModelInfo): string;
}

export class ModelSegmentImpl implements ModelSegment {
  format(model: ModelInfo): string {
    return `${style("muted")(`(${model.provider}) `)}${style("accent")(model.id)}${style("muted")(` | ${model.effort}`)}`;
  }
}

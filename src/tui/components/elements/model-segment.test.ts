import { style } from "../themes";
import { ModelSegmentImpl } from "./model-segment";

describe("ModelSegmentImpl", () => {
  test("renders provider muted, model id accent, and effort muted", () => {
    const segment = new ModelSegmentImpl().format({ provider: "lm-studio", id: "qwen3.5-4b", effort: "medium", contextWindow: 128000 });
    expect(segment).toBe(`${style("muted")("(lm-studio) ")}${style("accent")("qwen3.5-4b")}${style("muted")(" | medium")}`);
  });
});

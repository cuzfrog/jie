import { formatModelSegment } from "./model-segment";
import { style } from "../themes";

describe("formatModelSegment", () => {
  test("renders provider muted, model id accent, and effort muted", () => {
    const segment = formatModelSegment({ provider: "lm-studio", id: "qwen3.5-4b", effort: "medium", contextWindow: 128000 });
    expect(segment).toBe(`${style("muted")("(lm-studio) ")}${style("accent")("qwen3.5-4b")}${style("muted")(" | medium")}`);
  });
});

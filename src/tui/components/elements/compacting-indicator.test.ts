import { makeAgentUiState } from "../../test";
import { CompactingIndicatorImpl } from "./compacting-indicator";

describe("CompactingIndicatorImpl", () => {
  test("returns null when the agent is null", () => {
    expect(new CompactingIndicatorImpl().format(null)).toBeNull();
  });

  test("returns null when the agent is not compacting", () => {
    const agent = makeAgentUiState("t1:a-1");
    expect(new CompactingIndicatorImpl().format(agent)).toBeNull();
  });

  test("returns a warning-styled Compacting... label when the agent is compacting", () => {
    const agent = makeAgentUiState("t1:a-1", { compactionInProgress: true });
    expect(new CompactingIndicatorImpl().format(agent)).toBe("\x1b[33mCompacting...\x1b[39m");
  });
});

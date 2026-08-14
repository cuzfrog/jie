import { makeAgentUiState } from "../../test";
import { TokenUsageImpl } from "./token-usage";

const tokenUsage = new TokenUsageImpl();

function model(contextWindow: number | null) {
  return { provider: "anthropic", id: "claude-sonnet-4", effort: "off" as const, contextWindow };
}

describe("TokenUsageImpl", () => {
  test("shows a muted dash when no agent is focused", () => {
    expect(tokenUsage.format(null)).toBe("\x1b[90m—\x1b[39m");
  });

  test("shows a muted dash when the agent has no model", () => {
    const agent = makeAgentUiState("my-team:general-1");
    expect(tokenUsage.format(agent)).toBe("\x1b[90m—\x1b[39m");
  });

  test("renders percent, window, upload and download counts", () => {
    const agent = makeAgentUiState("my-team:general-1", {
      model: model(200000),
      contextTokensUsed: 100000,
      uploadTokens: 1234,
      downloadTokens: 567,
    });
    expect(tokenUsage.format(agent)).toContain("50%/200k");
    expect(tokenUsage.format(agent)).toContain("1.2k↑");
    expect(tokenUsage.format(agent)).toContain("567↓");
  });

  test("uses compact notation for large token counts", () => {
    const agent = makeAgentUiState("my-team:general-1", {
      model: model(200000),
      contextTokensUsed: 100000,
      uploadTokens: 1_500_000,
      downloadTokens: 999,
    });
    expect(tokenUsage.format(agent)).toContain("1.5m↑");
    expect(tokenUsage.format(agent)).toContain("999↓");
  });

  test("uses the warning color between 70% and 89%", () => {
    const agent = makeAgentUiState("my-team:general-1", {
      model: model(1000),
      contextTokensUsed: 750,
      uploadTokens: 0,
      downloadTokens: 0,
    });
    expect(tokenUsage.format(agent)).toContain("\x1b[33m");
  });

  test("uses the error color at 90% and above", () => {
    const agent = makeAgentUiState("my-team:general-1", {
      model: model(1000),
      contextTokensUsed: 900,
      uploadTokens: 0,
      downloadTokens: 0,
    });
    expect(tokenUsage.format(agent)).toContain("\x1b[31m");
  });
});

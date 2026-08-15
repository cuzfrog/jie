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

  test("uses the warning color at exactly 70%", () => {
    const agent = makeAgentUiState("my-team:general-1", {
      model: model(1000),
      contextTokensUsed: 700,
      uploadTokens: 0,
      downloadTokens: 0,
    });
    expect(tokenUsage.format(agent)).toContain("\x1b[33m");
  });

  test("uses the error color at exactly 90%", () => {
    const agent = makeAgentUiState("my-team:general-1", {
      model: model(1000),
      contextTokensUsed: 900,
      uploadTokens: 0,
      downloadTokens: 0,
    });
    expect(tokenUsage.format(agent)).toContain("\x1b[31m");
  });

  test("shows a muted dash for the context percent when the model context window is null", () => {
    const agent = makeAgentUiState("my-team:general-1", { model: model(null), uploadTokens: 0, downloadTokens: 0 });
    expect(tokenUsage.format(agent)).toContain("\x1b[90m— 0↑ 0↓\x1b[39m");
  });

  test("shows a muted dash for the context percent when the model context window is zero", () => {
    const agent = makeAgentUiState("my-team:general-1", { model: model(0), uploadTokens: 0, downloadTokens: 0 });
    expect(tokenUsage.format(agent)).toContain("\x1b[90m— 0↑ 0↓\x1b[39m");
  });

  test("rounds percent down and formats the window as a k-suffix", () => {
    const agent = makeAgentUiState("my-team:general-1", {
      model: model(128000),
      contextTokensUsed: 12800,
      uploadTokens: 0,
      downloadTokens: 0,
    });
    expect(tokenUsage.format(agent)).toContain("10%/128k");
  });

  test("floors 1500 to 1k for the window label", () => {
    const agent = makeAgentUiState("my-team:general-1", {
      model: model(1500),
      contextTokensUsed: 0,
      uploadTokens: 0,
      downloadTokens: 0,
    });
    expect(tokenUsage.format(agent)).toContain("0%/1k");
  });

  test("clamps percent to 100 when used exceeds the window", () => {
    const agent = makeAgentUiState("my-team:general-1", {
      model: model(1000),
      contextTokensUsed: 1500,
      uploadTokens: 0,
      downloadTokens: 0,
    });
    expect(tokenUsage.format(agent)).toContain("100%/1k");
  });
});

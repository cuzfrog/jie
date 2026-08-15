import { visibleWidth } from "@earendil-works/pi-tui";
import { makeAgentUiState } from "../../test";
import { type TokenUsage } from "../elements";
import { TeamTable, type TeamTableColumn, type TeamTableOptions } from "./team-table";

function agent(id: string, overrides: Parameters<typeof makeAgentUiState>[1] = {}) {
  return makeAgentUiState(id as `${string}:${string}`, overrides);
}

describe("TeamTable", () => {
  const allColumns: TeamTableColumn[] = ["agent", "ctx", "tools", "subscribe", "model"];
  const defaultOptions: TeamTableOptions = { pointed: null, focused: null };
  const tokenUsage: TokenUsage = { format: (a) => a === null || a.model === null ? "—" : `50%/${a.model.contextWindow}` };
  const table = new TeamTable(tokenUsage);

  test("renders a header and one row per agent", () => {
    const agents = [agent("t1:general-1", { isLeader: true, tools: ["bash", "read_file"] })];
    const lines = table.render(agents, allColumns, 80, defaultOptions);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("agent");
    expect(lines[1]).toContain("general-1");
  });

  test("marks the leader and the pointed agent", () => {
    const agents = [
      agent("t1:leader-1", { isLeader: true }),
      agent("t1:worker-1"),
    ];
    const options: TeamTableOptions = { pointed: "t1:worker-1", focused: null };
    const lines = table.render(agents, allColumns, 80, options);
    expect(lines[1]).toContain("leader");
    expect(lines[2]).toContain("▸");
  });

  test("renders tool and subscribe lists", () => {
    const agents = [agent("t1:general-1", { tools: ["bash"], subscribe: ["agent.stream.chunk"] })];
    const lines = table.render(agents, ["agent", "tools", "subscribe"], 80, defaultOptions);
    expect(lines[1]).toContain("bash");
    expect(lines[1]).toContain("agent.stream.chunk");
  });

  test("drops droppable columns when the width is too narrow", () => {
    const agents = [
      agent("t1:long-name-agent", { tools: ["read_file", "write_file", "bash", "search"] }),
      agent("t1:another-long-agent", { subscribe: ["a", "b", "c", "d"] }),
    ];
    const lines = table.render(agents, allColumns, 30, { ...defaultOptions, droppable: ["tools", "subscribe", "model"] });
    expect(lines[0]).toContain("agent");
    expect(lines[0]).not.toContain("tools");
    expect(lines[1]).not.toContain("read_file");
  });

  test("uses tokenUsage to render the ctx cell", () => {
    const agents = [agent("t1:general-1", { contextTokensUsed: 500, model: { provider: "anthropic", id: "claude-sonnet-4-5", effort: "off", contextWindow: 1000 } })];
    const lines = table.render(agents, ["agent", "ctx"], 40, defaultOptions);
    expect(lines[1]).toContain("50%");
  });

  test("truncates rows to the requested width", () => {
    const agents = [agent("t1:general-1", { tools: ["one", "two", "three", "four", "five"] })];
    const lines = table.render(agents, ["agent", "tools"], 25, defaultOptions);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(25);
    }
  });
});

import type { JiePlatform } from "../../../platform";
import { makeTuiState } from "../../test";
import { McpCommand } from "./mcp-command";

function makeContext() {
  return { state: makeTuiState(), platform: vi.mocked<JiePlatform>({
    settings: {},
    prompt: vi.fn(),
    interrupt: vi.fn(),
    dequeuePrompt: vi.fn(),
    requeuePrompt: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    execute: vi.fn(),
    teams: vi.fn(() => []),
    shutdown: vi.fn(),
  }) };
}

describe("McpCommand", () => {
  test("bare /mcp resolves to the listMcpServers platform command", () => {
    const command = new McpCommand();
    expect(command.resolve(makeContext(), [])).toEqual({
      kind: "platform",
      slashName: "mcp",
      command: { name: "listMcpServers" },
    });
  });

  test("/mcp with an argument yields a usage error", () => {
    const command = new McpCommand();
    expect(command.resolve(makeContext(), ["list"])).toEqual({
      kind: "error",
      text: "/mcp",
    });
  });
});

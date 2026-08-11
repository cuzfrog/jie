import { makePlatform, makeTuiState, teamState } from "../../test";
import { CompactCommand } from "./compact-command";

describe("CompactCommand", () => {
  const command = new CompactCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("compact");
    expect(command.meta.description).toBe("compact the conversation of the focused agent");
  });

  test("resolve requires a focused agent", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "/compact: no focused agent" });
  });

  test("resolve rejects while the focused agent is busy", () => {
    const { platform } = makePlatform();
    const context = { state: teamState("t1", "busy"), platform };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "wait for the current response to finish before compacting" });
  });

  test("resolve builds the compact command", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, [])).toEqual({
      kind: "platform",
      slashName: "compact",
      command: { name: "compact", teamId: "t1", agentKey: "general-1" },
      transient: "compacting conversation...",
    });
  });

  test("complete returns null", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(await command.complete("", context)).toBe(null);
  });
});

import type { SessionSummary } from "../../../platform";
import { makePlatform, makeTuiState, teamState } from "../../test";
import { ResumeCommand } from "./resume-command";

describe("ResumeCommand", () => {
  const command = new ResumeCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("resume");
    expect(command.meta.description).toBe("resume a session of the loaded team");
    expect(command.meta.argumentHint).toBe("<sessionId>");
  });

  test("resolve requires a loaded team", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["sess-1"])).toEqual({ kind: "error", text: "/resume: no team loaded" });
  });

  test("resolve requires a session id", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "/resume <sessionId>" });
  });

  test("resolve builds the resume session command", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["sess-1"])).toEqual({
      kind: "platform",
      slashName: "resume",
      command: { name: "resumeSession", teamId: "t1", sessionId: "sess-1" },
      transient: "resuming session 'sess-1'",
    });
  });

  test("complete returns sessions with message counts and relative ages", async () => {
    const { platform, execute } = makePlatform();
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const sessions: ReadonlyArray<SessionSummary> = [{ sessionId: "sess-1", name: "First", messageCount: 42, lastActivity: lastWeek }];
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "listSessions") return sessions;
      return null;
    });
    const context = { state: teamState(), platform };
    const result = await command.complete("", context);
    expect(result).not.toBe(null);
    expect(result!.items[0]).toEqual({
      value: "sess-1",
      label: "First",
      description: expect.stringContaining("42 msg"),
    });
  });

  test("complete falls back to the session id as label", async () => {
    const { platform, execute } = makePlatform();
    const sessions: ReadonlyArray<SessionSummary> = [{ sessionId: "sess-1", messageCount: 0, lastActivity: new Date().toISOString() }];
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "listSessions") return sessions;
      return null;
    });
    const context = { state: teamState(), platform };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [{ value: "sess-1", label: "sess-1", description: expect.stringContaining("0 msg") }],
    });
  });

  test("complete filters sessions by a substring of the session id or name", async () => {
    const { platform, execute } = makePlatform();
    const sessions: ReadonlyArray<SessionSummary> = [
      { sessionId: "abc-123-xyz", name: "First", messageCount: 1, lastActivity: new Date().toISOString() },
      { sessionId: "def-456-uvw", name: "Second", messageCount: 2, lastActivity: new Date().toISOString() },
    ];
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "listSessions") return sessions;
      return null;
    });
    const context = { state: teamState(), platform };
    const result = await command.complete("123", context);
    expect(result).toEqual({
      items: [{ value: "abc-123-xyz", label: "First", description: expect.stringContaining("1 msg") }],
    });
  });

  test("complete with no team loaded returns null", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(await command.complete("", context)).toBe(null);
  });
});

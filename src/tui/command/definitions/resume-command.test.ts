import type { SessionSummary } from "../../../platform";
import { makeTuiState } from "../../test";
import { ResumeCommand } from "./resume-command";
import { makePlatform, teamState } from "./_test-fixture";

describe("ResumeCommand", () => {
  const command = new ResumeCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("resume");
    expect(command.meta.description).toBe("resume a session of the loaded team");
    expect(command.meta.argumentHint).toBe("<sessionId>");
  });

  test("resolve requires a loaded team", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["sess-1"])).toEqual({ kind: "error", text: "/resume: no team loaded" });
  });

  test("resolve requires a session id", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "/resume <sessionId>" });
  });

  test("resolve builds the resume session command", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, ["sess-1"])).toEqual({
      kind: "platform",
      slashName: "resume",
      command: { name: "resumeSession", teamId: "t1", sessionId: "sess-1" },
      transient: "resuming session 'sess-1'",
    });
  });

  test("complete returns sessions with message counts and relative ages", async () => {
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const sessions: ReadonlyArray<SessionSummary> = [{ sessionId: "sess-1", name: "First", messageCount: 42, lastActivity: lastWeek }];
    const context = {
      state: teamState(),
      platform: makePlatform(async (cmd) => (cmd.name === "listSessions" ? sessions : null)),
    };
    const result = await command.complete("", context);
    expect(result).not.toBe(null);
    expect(result!.items[0]).toEqual({
      value: "sess-1",
      label: "First",
      description: expect.stringContaining("42 msg"),
    });
  });

  test("complete falls back to the session id as label", async () => {
    const sessions: ReadonlyArray<SessionSummary> = [{ sessionId: "sess-1", messageCount: 0, lastActivity: new Date().toISOString() }];
    const context = {
      state: teamState(),
      platform: makePlatform(async (cmd) => (cmd.name === "listSessions" ? sessions : null)),
    };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [{ value: "sess-1", label: "sess-1", description: expect.stringContaining("0 msg") }],
    });
  });

  test("complete with no team loaded returns null", async () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(await command.complete("", context)).toBe(null);
  });
});

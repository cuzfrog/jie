import { JiePlatformError, type JiePlatformErrorCode } from "./jie-platform-errors";

describe("JiePlatformError", () => {
  test("uses the base message when no detail is provided", () => {
    const error = new JiePlatformError("FILE_NOT_FOUND");
    expect(error.message).toBe("File not found");
    expect(error.code).toBe("FILE_NOT_FOUND");
    expect(error.detail).toBeUndefined();
    expect(error.data).toBeUndefined();
    expect(error.name).toBe("JiePlatformError");
  });

  test("appends the detail to the base message when provided", () => {
    const error = new JiePlatformError("PATH_ESCAPE", { detail: "/tmp" });
    expect(error.message).toBe("Path escapes the workspace root: /tmp");
    expect(error.detail).toBe("/tmp");
  });

  test("preserves the cause when provided", () => {
    const cause = new Error("wrapped");
    const error = new JiePlatformError("IO_ERROR", { cause });
    expect(error.cause).toBe(cause);
  });

  test("preserves the data record when provided", () => {
    const data = { teamId: "alpha" };
    const error = new JiePlatformError("TEAM_NOT_FOUND", { data });
    expect(error.data).toEqual(data);
  });

  test("supports all documented error codes", () => {
    const codes: JiePlatformErrorCode[] = [
      "NO_MODEL_ERROR",
      "MODEL_UNRESOLVED",
      "FILE_NOT_FOUND",
      "PATH_ESCAPE",
      "WORKDIR_ESCAPE",
      "IS_A_DIRECTORY",
      "NOT_A_DIRECTORY",
      "FILE_TOO_LARGE",
      "UNSUPPORTED_ENCODING",
      "PERMISSION_DENIED",
      "DISK_FULL",
      "IO_ERROR",
      "NO_MATCH",
      "AMBIGUOUS_MATCH",
      "OVERLAPPING_EDITS",
      "INVALID_PATTERN",
      "KANBAN_WRITE_INVALID",
      "KANBAN_CARD_NOT_FOUND",
      "KANBAN_TEXT_EMPTY",
      "KANBAN_DUPLICATE_CONTENT",
      "INVALID_ARTIFACT_KEY",
      "ARTIFACT_TOO_LARGE",
      "ARTIFACT_KEY_RESERVED",
      "COMMAND_TIMED_OUT",
      "NOTIFY_INVALID_TOPIC",
      "NOTIFY_PROMPT_TOO_LONG",
      "INVALID_TASK_ID",
      "ILLEGAL_TRANSITION",
      "WRITE_GATE_DENIED",
      "UNSUPPORTED_SCHEME",
      "UNSUPPORTED_CONTENT_TYPE",
      "REDIRECT_EXHAUSTED",
      "WEB_SEARCH_FAILED",
      "INVALID_TEAM_ID",
      "TEAM_NOT_FOUND",
      "INVALID_ROLE",
      "DUPLICATE_ROLE",
      "INVALID_FRONTMATTER",
      "INVALID_FIELD_TYPE",
      "MISSING_REQUIRED_FIELD",
      "INVALID_MODEL_STRING",
      "UNKNOWN_PROVIDER",
      "LEADER_REQUIRED",
      "LEADER_MISMATCH",
      "LEADER_UNKNOWN",
      "TEAM_FILE_REQUIRED",
      "INVALID_LIFECYCLE",
      "SUBSCRIBE_REJECTS_PLATFORM_TOPIC",
      "TOOL_SPEC_UNRESOLVED",
      "OAUTH_NOT_SUPPORTED",
      "UNKNOWN_SESSION",
      "INVALID_SESSION_NAME",
      "INVALID_CONFIG",
      "RELOAD_FAILED",
      "NO_DEFAULT_PROVIDER",
      "NO_TEAM",
      "NO_LEADER",
      "AGENT_NOT_FOUND",
    ];
    for (const code of codes) {
      const error = new JiePlatformError(code);
      expect(error.code).toBe(code);
      expect(error.message.length).toBeGreaterThan(0);
    }
  });
});

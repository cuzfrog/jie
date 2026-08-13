const JiePlatformErrorMessages = {
  NO_MODEL_ERROR: "No model has been selected, please login and select a default model.",
  MODEL_UNRESOLVED: "Model could not be resolved",

  FILE_NOT_FOUND: "File not found",
  PATH_ESCAPE: "Path escapes the workspace root",
  WORKDIR_ESCAPE: "Workdir escapes the workspace root",
  IS_A_DIRECTORY: "Path is a directory",
  NOT_A_DIRECTORY: "Path is not a directory",
  FILE_TOO_LARGE: "File content exceeds the maximum allowed size",
  UNSUPPORTED_ENCODING: "File is not valid UTF-8",
  PERMISSION_DENIED: "Permission denied",
  DISK_FULL: "Disk is full",
  IO_ERROR: "I/O error",
  NO_MATCH: "old_string was not found in the file",
  AMBIGUOUS_MATCH: "old_string matched more than one location in the file",
  OVERLAPPING_EDITS: "edits overlap each other in the file",
  INVALID_PATTERN: "Invalid search pattern",

  KANBAN_WRITE_INVALID: "Kanban board violates the write_kanban contract",
  KANBAN_CARD_NOT_FOUND: "Kanban card not found",
  KANBAN_TODO_NOT_FOUND: "Kanban todo not found",
  KANBAN_TEXT_EMPTY: "Kanban card text must not be empty",
  KANBAN_DUPLICATE_CONTENT: "A card with this content already exists on the board",

  INVALID_ARTIFACT_KEY: "Invalid artifact key",
  ARTIFACT_TOO_LARGE: "Artifact content exceeds the maximum allowed size",

  COMMAND_TIMED_OUT: "Command exceeded the time limit",

  CALL_AGENT_SELF: "Agent cannot call itself",
  AGENT_NOT_ALLOWED: "Agent target is not allowed",
  NOTIFY_INVALID_TOPIC: "Invalid topic for notify",
  NOTIFY_PROMPT_TOO_LONG: "Notify prompt exceeds the maximum allowed size",
  TOPIC_NOT_ALLOWED: "Notify topic is not allowed for this role",

  WRITE_PATH_DENIED: "Write path is not allowed for this role",
  READ_PATH_DENIED: "Read path is not allowed for this role",
  INVALID_TOOL_SPEC: "Invalid tool spec in manifest",

  UNSUPPORTED_SCHEME: "URL must use http or https",
  UNSUPPORTED_CONTENT_TYPE: "Response content-type is not supported",
  REDIRECT_EXHAUSTED: "Too many redirects",
  WEB_SEARCH_FAILED: "Web search failed",

  INVALID_TEAM_ID: "Invalid team_id",
  TEAM_NOT_FOUND: "Team not found",
  INVALID_ROLE: "Invalid role",
  DUPLICATE_ROLE: "Duplicate role in team",
  INVALID_AGENT_REF: "Invalid additional-agent reference",
  DUPLICATE_AGENT_REF: "Duplicate additional-agent reference",
  INVALID_FRONTMATTER: "Invalid YAML frontmatter",
  INVALID_FIELD_TYPE: "Field type mismatch",
  MISSING_REQUIRED_FIELD: "Required field missing",
  INVALID_MODEL_STRING: "Invalid model string",
  UNKNOWN_PROVIDER: "Unknown provider",
  LEADER_REQUIRED: "TEAM.md leader is required",
  LEADER_MISMATCH: "TEAM.md leader does not match the only agent",
  LEADER_UNKNOWN: "TEAM.md leader references unknown role",
  LEADER_REPLICA_FORBIDDEN: "TEAM.md leader role must have replica: 1",
  TEAM_FILE_REQUIRED: "TEAM.md is required for multi-agent teams",
  REPLICA_LIMIT_EXCEEDED: "Agent replica count exceeds the maximum allowed",
  SUBSCRIBE_REJECTS_PLATFORM_TOPIC: "subscribe cannot target a platform topic",
  TOOL_SPEC_UNRESOLVED: "Tool spec resolved no tools",

  OAUTH_NOT_SUPPORTED: "OAuth credentials are not supported in v1",

  UNKNOWN_SESSION: "Unknown session_id",
  INVALID_SESSION_NAME: "Invalid session name",

  INVALID_CONFIG: "Invalid configuration",

  RELOAD_FAILED: "Reload failed to rebuild a team",

  NO_DEFAULT_PROVIDER: "No default provider is set",
  NO_TEAM: "No team is defined",
  NO_LEADER: "Team has no leader",
  AGENT_NOT_FOUND: "Agent not found",
} as const;

export type JiePlatformErrorCode = keyof typeof JiePlatformErrorMessages;

export interface JiePlatformErrorOptions {
  readonly detail?: string;
  readonly cause?: Error;
  readonly data?: Record<string, unknown>;
}

export class JiePlatformError extends Error {
  readonly code: JiePlatformErrorCode;
  readonly detail: string | undefined;
  readonly data: Record<string, unknown> | undefined;

  constructor(code: JiePlatformErrorCode, options: JiePlatformErrorOptions = {}) {
    const base = JiePlatformErrorMessages[code];
    const detail = options.detail;
    super(
      detail === undefined ? base : `${base}: ${detail}`,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "JiePlatformError";
    this.code = code;
    this.detail = detail;
    this.data = options.data;
  }
}

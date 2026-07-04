export const JiePlatformErrorMessages = {
  NO_MODEL_ERROR: "No model has been selected, please login and select a default model.",

  FILE_NOT_FOUND: "File not found",
  PATH_ESCAPE: "Path escapes the workspace root",
  WORKDIR_ESCAPE: "Workdir escapes the workspace root",
  IS_A_DIRECTORY: "Path is a directory",
  FILE_TOO_LARGE: "File content exceeds the maximum allowed size",
  UNSUPPORTED_ENCODING: "File is not valid UTF-8",
  PERMISSION_DENIED: "Permission denied",
  DISK_FULL: "Disk is full",
  IO_ERROR: "I/O error",

  INVALID_ARTIFACT_KEY: "Invalid artifact key",
  ARTIFACT_TOO_LARGE: "Artifact content exceeds the maximum allowed size",

  COMMAND_TIMED_OUT: "Command exceeded the time limit",

  NOTIFY_INVALID_TOPIC: "Invalid topic for notify",
  NOTIFY_PROMPT_TOO_LONG: "Notify prompt exceeds the maximum allowed size",

  UNSUPPORTED_SCHEME: "URL must use http or https",
  UNSUPPORTED_CONTENT_TYPE: "Response content-type is not supported",
  REDIRECT_EXHAUSTED: "Too many redirects",
  WEB_SEARCH_FAILED: "Web search failed",

  INVALID_TEAM_ID: "Invalid team_id",
  TEAM_NOT_FOUND: "Team not found",
  INVALID_ROLE: "Invalid role",
  DUPLICATE_ROLE: "Duplicate role in team",
  INVALID_FRONTMATTER: "Invalid YAML frontmatter",
  INVALID_FIELD_TYPE: "Field type mismatch",
  MISSING_REQUIRED_FIELD: "Required field missing",
  INVALID_MODEL_STRING: "Invalid model string",
  UNKNOWN_PROVIDER: "Unknown provider",
  LEADER_REQUIRED: "TEAM.md leader is required",
  LEADER_MISMATCH: "TEAM.md leader does not match the only agent",
  LEADER_UNKNOWN: "TEAM.md leader references unknown role",
  TEAM_FILE_REQUIRED: "TEAM.md is required for multi-agent teams",
  SUBSCRIBE_REJECTS_PLATFORM_TOPIC: "subscribe cannot target a platform topic",

  OAUTH_NOT_SUPPORTED: "OAuth credentials are not supported in v1",

  UNKNOWN_SESSION: "Unknown session_id",

  INVALID_CONFIG: "Invalid configuration",

  NO_DEFAULT_PROVIDER: "No default provider is set",
  EMPTY_TEAM: "Team has no agents to run",
  NO_LEADER: "Team has no leader",
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

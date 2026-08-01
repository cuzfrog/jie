import {
  DEFAULT_HOOK_TIMEOUT_MS,
  HOOK_EVENTS,
  type HookCommand,
  type HookDiagnostic,
  type HookEvent,
  type HookMatcher,
  type HooksConfig,
  type HookSource,
  type LoadHooksResult,
} from "./types";

export function parseHooksConfig(sources: ReadonlyArray<HookSource>): LoadHooksResult {
  const config: { -readonly [K in keyof HooksConfig]: HookMatcher[] } = {
    PreToolUse: [],
    PostToolUse: [],
    UserPromptSubmit: [],
    SessionStart: [],
    Stop: [],
  };
  const diagnostics: HookDiagnostic[] = [];
  for (const source of sources) {
    if (source.hooks === undefined) continue;
    if (!isObject(source.hooks)) {
      diagnostics.push({ path: source.path, message: "'hooks' must be an object; ignoring" });
      continue;
    }
    for (const event of HOOK_EVENTS) {
      config[event].push(...parseEvent(source.path, source.hooks, event, diagnostics));
    }
  }
  return { config, diagnostics };
}

function parseEvent(path: string, rawHooks: Record<string, unknown>, event: HookEvent, diagnostics: HookDiagnostic[]): HookMatcher[] {
  const groups = rawHooks[event];
  if (groups === undefined) return [];
  if (!Array.isArray(groups)) {
    diagnostics.push({ path, message: `'${event}' must be an array of matcher groups; ignoring` });
    return [];
  }
  const matchers: HookMatcher[] = [];
  for (const group of groups) {
    const matcher = parseMatcherGroup(path, event, group, diagnostics);
    if (matcher !== null) matchers.push(matcher);
  }
  return matchers;
}

function parseMatcherGroup(path: string, event: HookEvent, group: unknown, diagnostics: HookDiagnostic[]): HookMatcher | null {
  if (!isObject(group)) {
    diagnostics.push({ path, message: `'${event}' matcher group must be an object; skipping` });
    return null;
  }
  const matcher = parseMatcher(path, event, group.matcher, diagnostics);
  const rawCommands = group.hooks;
  if (!Array.isArray(rawCommands)) {
    diagnostics.push({ path, message: `'${event}' matcher group 'hooks' must be an array; skipping` });
    return null;
  }
  const hooks: HookCommand[] = [];
  for (const rawCommand of rawCommands) {
    const command = parseCommand(path, event, rawCommand, diagnostics);
    if (command !== null) hooks.push(command);
  }
  if (hooks.length === 0) {
    diagnostics.push({ path, message: `'${event}' matcher group has no valid command handlers; skipping` });
    return null;
  }
  return { matcher, hooks };
}

function parseMatcher(path: string, event: HookEvent, value: unknown, diagnostics: HookDiagnostic[]): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") {
    diagnostics.push({ path, message: `'${event}' 'matcher' must be a string; treating as match-all` });
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "*" ? null : trimmed;
}

function parseCommand(path: string, event: HookEvent, value: unknown, diagnostics: HookDiagnostic[]): HookCommand | null {
  if (!isObject(value)) {
    diagnostics.push({ path, message: `'${event}' hook handler must be an object; skipping` });
    return null;
  }
  if (value.type !== "command") {
    diagnostics.push({ path, message: `'${event}' hook handler 'type' must be "command"; skipping` });
    return null;
  }
  if (typeof value.command !== "string" || value.command.trim() === "") {
    diagnostics.push({ path, message: `'${event}' hook handler 'command' must be a non-empty string; skipping` });
    return null;
  }
  return { command: value.command, timeoutMs: parseTimeout(value.timeout) };
}

function parseTimeout(value: unknown): number {
  if (value === undefined) return DEFAULT_HOOK_TIMEOUT_MS;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return DEFAULT_HOOK_TIMEOUT_MS;
  return Math.round(value * 1000);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

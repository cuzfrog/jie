import { DEFAULT_HOOK_TIMEOUT_MS, HOOK_EVENTS, type HookCommand, type HookMatcher, type HooksConfig } from "./types";

export function parseHooksConfig(globalHooks: unknown, projectHooks: unknown): HooksConfig {
  const config: { -readonly [K in keyof HooksConfig]: HookMatcher[] } = {
    PreToolUse: [],
    PostToolUse: [],
    UserPromptSubmit: [],
    SessionStart: [],
    Stop: [],
  };
  for (const event of HOOK_EVENTS) {
    config[event].push(...parseEvent(globalHooks, event));
    config[event].push(...parseEvent(projectHooks, event));
  }
  return config;
}

function parseEvent(rawHooks: unknown, event: (typeof HOOK_EVENTS)[number]): HookMatcher[] {
  if (!isObject(rawHooks)) return [];
  const groups = rawHooks[event];
  if (!Array.isArray(groups)) return [];
  const matchers: HookMatcher[] = [];
  for (const group of groups) {
    const matcher = parseMatcherGroup(group);
    if (matcher !== null) matchers.push(matcher);
  }
  return matchers;
}

function parseMatcherGroup(group: unknown): HookMatcher | null {
  if (!isObject(group)) return null;
  const matcher = parseMatcher(group.matcher);
  const rawCommands = group.hooks;
  if (!Array.isArray(rawCommands)) return null;
  const hooks: HookCommand[] = [];
  for (const rawCommand of rawCommands) {
    const command = parseCommand(rawCommand);
    if (command !== null) hooks.push(command);
  }
  if (hooks.length === 0) return null;
  return { matcher, hooks };
}

function parseMatcher(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" || trimmed === "*" ? null : trimmed;
}

function parseCommand(value: unknown): HookCommand | null {
  if (!isObject(value)) return null;
  if (value.type !== "command") return null;
  if (typeof value.command !== "string" || value.command.trim() === "") return null;
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

import { existsSync, mkdirSync, writeFileSync, chmodSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  SqliteStorage,
  loadAuthJson,
  loadMergedSettings,
  ModelRegistry,
  resolveStaleDefaultTeam,
  startJie,
  type MergedSettings,
  type AuthJson,
  type JieHandle,
  type AgentEvent,
  type EventBus,
  type TeamBlueprint,
} from "@cuzfrog/jie-platform";
import type { Model } from "@earendil-works/pi-ai";
import { getProviders } from "@earendil-works/pi-ai";
import type { Agent } from "@earendil-works/pi-agent-core";
import { parseFlags, type ParsedCli } from "./cli-flags.ts";
import { VERSION } from "./version.ts";

function resolvedHomeDir(): string {
  // `os.homedir()` in bun caches the value at startup and does
  // not honor runtime `process.env.HOME` changes (used by tests).
  // Read `process.env.HOME` directly so tests can redirect HOME.
  const fromEnv = process.env.HOME;
  return fromEnv !== undefined && fromEnv !== "" ? fromEnv : homedir();
}
function homeJieDir(): string {
  return join(resolvedHomeDir(), ".jie");
}
function globalAuthPath(): string {
  return join(resolvedHomeDir(), ".jie", "auth.json");
}
function globalSettingsPath(): string {
  return join(resolvedHomeDir(), ".jie", "settings.json");
}

function findProjectJieRoot(cwd: string): string | null {
  let current = cwd;
  for (;;) {
    if (existsSync(join(current, ".jie"))) return current;
    const parent = join(current, "..");
    if (parent === current) return null;
    current = parent;
  }
}

function projectArtifactsPath(cwd: string): string {
  const root = findProjectJieRoot(cwd);
  if (root === null) {
    mkdirSync(join(cwd, ".jie"), { recursive: true, mode: 0o755 });
    return join(cwd, ".jie", "artifacts.db");
  }
  return join(root, ".jie", "artifacts.db");
}

function projectSettingsPath(cwd: string): string | null {
  const root = findProjectJieRoot(cwd);
  if (root === null) return null;
  return join(root, ".jie", "settings.json");
}

function writeAuthJson(auth: AuthJson): void {
  mkdirSync(homeJieDir(), { recursive: true, mode: 0o755 });
  const path = globalAuthPath();
  writeFileSync(path, JSON.stringify(auth, null, 2), "utf-8");
  chmodSync(path, 0o600);
}

function writeSettings(
  settings: MergedSettings,
  scope: "project" | "global",
  cwd: string,
): void {
  if (scope === "project") {
    const root = findProjectJieRoot(cwd) ?? cwd;
    mkdirSync(join(root, ".jie"), { recursive: true, mode: 0o755 });
    const path = join(root, ".jie", "settings.json");
    writeFileSync(path, JSON.stringify(settings, null, 2), "utf-8");
  } else {
    mkdirSync(homeJieDir(), { recursive: true, mode: 0o755 });
    writeFileSync(globalSettingsPath(), JSON.stringify(settings, null, 2), "utf-8");
  }
}

function loadAuthOrEmpty(): AuthJson {
  try {
    return loadAuthJson({ homeDir: resolvedHomeDir() });
  } catch {
    return {};
  }
}

function setAuthProvider(auth: AuthJson, provider: string, key: string): AuthJson {
  return { ...auth, [provider]: { type: "api_key", key } };
}

function removeAuthProvider(auth: AuthJson, provider: string): AuthJson {
  const next: AuthJson = { ...auth };
  delete next[provider];
  return next;
}

function printError(msg: string): void {
  console.error(msg);
}

/** The platform's built-in minimal team is always available; it is
 *  not a user-installed team and never lives under `.jie/teams/`
 *  or `~/.jie/teams/`. The CLI passes it to `startJie` as the
 *  literal `"minimal"`; the platform's loader resolves it from
 *  its built-in `.md` files. */
const BUILTIN_MINIMAL_TEAM_ID = "minimal";

function teamInstalled(teamId: string, cwd: string): boolean {
  if (teamId === BUILTIN_MINIMAL_TEAM_ID) return true;
  const root = findProjectJieRoot(cwd);
  const candidates = [
    root ? join(root, ".jie", "teams", teamId) : null,
    join(homeJieDir(), "teams", teamId),
  ].filter((p): p is string => p !== null);
  return candidates.some((p) => existsSync(join(p, "TEAM.md")));
}

export async function main(argv: string[]): Promise<number> {
  const parsed = parseFlags(argv);
  return run(parsed, process.cwd(), argv).then(
    (code) => code,
    (err) => {
      printError(err instanceof Error ? err.message : String(err));
      return 1;
    },
  );
}

interface PrintHooks {
  /** Override the team loader (used by tests). */
  loadTeamBlueprint?: (teamId: string) => TeamBlueprint;
  /** Override the model resolver (used by tests). */
  resolveModel?: (provider: string, modelId: string) => Model<any>;
  /** Override the API key resolver (used by tests). */
  getApiKey?: (provider: string) => string | undefined;
  /** Override the merged settings (used by tests). */
  settingsOverride?: MergedSettings;
  /** Override the pi-agent factory (used by tests to inject a
   *  controllable agent that fires canned events). */
  createAgent?: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
}

async function run(parsed: ParsedCli, cwd: string, _argv: string[]): Promise<number> {
  switch (parsed.kind) {
    case "help":
      printHelp();
      return 0;
    case "version":
      console.log(`jie ${VERSION}`);
      return 0;
    case "tui":
      printError("TUI not implemented in v1 MVP; use jie -p");
      return 1;
    case "error":
      printError(parsed.message);
      return 1;
    case "login":
      return runLogin(parsed, cwd);
    case "logout":
      return runLogout(parsed, cwd);
    case "model":
      return runModel(parsed, cwd);
    case "team":
      return runTeam(parsed, cwd);
    case "apiKey":
      return runApiKey(parsed, cwd);
    case "print":
      return runPrint(parsed, cwd, _argv as unknown as PrintHooks);
  }
}

function printHelp(): void {
  console.log(`jie - The jie platform CLI

Usage:
  jie -p "<instruction>" [--team <id>] [--timeout <s>] [--json]
                 [--api-key <key>] [--resume <id> | --continue]
  jie --print "<instruction>" ...

  jie login --provider <id> --api-key <key>
  jie logout [<provider>]
  jie model <provider>/<modelId>
  jie team [<id>] | [--unset]

  jie --api-key <key>
  jie --resume <session_id> | --continue

  jie [--team <id>]                  # interactive TUI (not in v1 MVP)
  jie --version
  jie --help
`);
}

async function runApiKey(
  parsed: Extract<ParsedCli, { kind: "apiKey" }>,
  cwd: string,
): Promise<number> {
  const settings = (() => {
    try {
      return loadMergedSettings(cwd, { homeDir: resolvedHomeDir() });
    } catch {
      return {} as MergedSettings;
    }
  })();
  const provider = settings.defaultProvider;
  if (provider === undefined) {
    printError(
      "no provider resolved; run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>' to set the key for a specific provider",
    );
    return 1;
  }
  const auth = loadAuthOrEmpty();
  writeAuthJson(setAuthProvider(auth, provider, parsed.apiKey));
  console.log(`logged in to ${provider}`);
  return 0;
}

async function runLogin(
  parsed: Extract<ParsedCli, { kind: "login" }>,
  _cwd: string,
): Promise<number> {
  if (parsed.provider === undefined || parsed.apiKey === undefined) {
    printError("interactive login not implemented in v1; use --provider and --api-key");
    return 1;
  }
  const auth = loadAuthOrEmpty();
  const next = setAuthProvider(auth, parsed.provider, parsed.apiKey);
  writeAuthJson(next);
  console.log(`logged in to ${parsed.provider}`);
  return 0;
}

async function runLogout(
  parsed: Extract<ParsedCli, { kind: "logout" }>,
  _cwd: string,
): Promise<number> {
  const auth = loadAuthOrEmpty();
  if (parsed.provider !== undefined) {
    const next = removeAuthProvider(auth, parsed.provider);
    writeAuthJson(next);
    console.log(`logged out of ${parsed.provider}`);
  } else {
    writeAuthJson({});
    console.log("logged out of all providers");
  }
  return 0;
}

async function runModel(
  parsed: Extract<ParsedCli, { kind: "model" }>,
  cwd: string,
): Promise<number> {
  const known = new Set<string>(getProviders() as readonly string[]);
  if (!known.has(parsed.provider)) {
    printError(`unknown provider: ${parsed.provider}`);
  }
  const projectPath = projectSettingsPath(cwd);
  const existing = (() => {
    try {
      return loadMergedSettings(cwd, { homeDir: resolvedHomeDir() });
    } catch {
      return {} as MergedSettings;
    }
  })();
  const next: MergedSettings = {
    ...existing,
    defaultProvider: parsed.provider,
    defaultModel: parsed.modelId,
  };
  if (projectPath !== null) {
    writeSettings(next, "project", cwd);
  } else {
    writeSettings(next, "global", cwd);
  }
  console.log(`default model set to ${parsed.provider}/${parsed.modelId}`);
  return 0;
}

/** Per spec, team ids are `[A-Za-z0-9_-]{1,32}`. */
const TEAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

function listInstalledTeamIds(cwd: string): string[] {
  const root = findProjectJieRoot(cwd);
  const candidates = [
    root ? join(root, ".jie", "teams") : null,
    join(homeJieDir(), "teams"),
  ].filter((p): p is string => p !== null);
  const seen = new Set<string>();
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const teamPath = join(dir, entry);
      if (entry.startsWith(".")) continue;
      if (!existsSync(join(teamPath, "TEAM.md"))) continue;
      seen.add(entry);
    }
  }
  seen.add(BUILTIN_MINIMAL_TEAM_ID);
  return [...seen].sort();
}

async function runTeam(
  parsed: Extract<ParsedCli, { kind: "team" }>,
  cwd: string,
): Promise<number> {
  if (parsed.teamId === undefined && !parsed.unset) {
    const merged = (() => {
      try {
        return loadMergedSettings(cwd, { homeDir: resolvedHomeDir() });
      } catch {
        return {} as MergedSettings;
      }
    })();
    const installed = listInstalledTeamIds(cwd);
    console.log(`defaultTeam: ${merged.defaultTeam ?? "unset"}`);
    console.log(`installed: ${installed.join(", ")}`);
    return 0;
  }
  if (parsed.unset) {
    const projectPath = projectSettingsPath(cwd);
    if (projectPath !== null && existsSync(projectPath)) {
      const existing = (() => {
        try {
          return loadMergedSettings(cwd, { homeDir: resolvedHomeDir() });
        } catch {
          return {} as MergedSettings;
        }
      })();
      const next = { ...existing };
      delete next.defaultTeam;
      writeSettings(next, "project", cwd);
    } else {
      const existing = (() => {
        try {
          return loadMergedSettings(cwd, { homeDir: resolvedHomeDir() });
        } catch {
          return {} as MergedSettings;
        }
      })();
      const next = { ...existing };
      delete next.defaultTeam;
      writeSettings(next, "global", cwd);
    }
    console.log("default team unset");
    return 0;
  }
  const id = parsed.teamId!;
  if (!TEAM_ID_PATTERN.test(id)) {
    printError(`invalid team id '${id}'; must match [A-Za-z0-9_-]{1,32}`);
    return 1;
  }
  const projectPath = projectSettingsPath(cwd);
  const projectTeamDir = projectPath
    ? join(projectPath, "..", "teams", id)
    : null;
  const globalTeamDir = join(homeJieDir(), "teams", id);
  const inProject = id === BUILTIN_MINIMAL_TEAM_ID
    || (projectTeamDir !== null && existsSync(join(projectTeamDir, "TEAM.md")));
  const inGlobal = id === BUILTIN_MINIMAL_TEAM_ID
    || existsSync(join(globalTeamDir, "TEAM.md"));
  if (!inProject && !inGlobal) {
    printError(`team '${id}' is not installed; checked .jie/teams/${id}/ and ~/.jie/teams/${id}/`);
    return 1;
  }
  const existing = (() => {
    try {
      return loadMergedSettings(cwd, { homeDir: resolvedHomeDir() });
    } catch {
      return {} as MergedSettings;
    }
  })();
  const next = { ...existing, defaultTeam: id };
  writeSettings(next, inProject ? "project" : "global", cwd);
  console.log(`default team set to ${id}`);
  return 0;
}

async function runPrint(
  parsed: Extract<ParsedCli, { kind: "print" }>,
  cwd: string,
  hooks: PrintHooks = {},
): Promise<number> {
  // --api-key first (writes auth.json before the rest of the flow runs).
  if (parsed.apiKey !== undefined) {
    const merged = (() => {
      try {
        return loadMergedSettings(cwd, { homeDir: resolvedHomeDir() });
      } catch {
        return {} as MergedSettings;
      }
    })();
    const provider = merged.defaultProvider;
    if (provider === undefined) {
      printError(
        "no provider resolved; run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>' to set the key for a specific provider",
      );
      return 1;
    }
    const auth = loadAuthOrEmpty();
    writeAuthJson(setAuthProvider(auth, provider, parsed.apiKey));
    console.log(`logged in to ${provider}`);
  }

  // Discover settings and team.
  const settings = (() => {
    try {
      return loadMergedSettings(cwd, { homeDir: resolvedHomeDir() });
    } catch (e) {
      printError(e instanceof Error ? e.message : String(e));
      return null;
    }
  })();
  if (settings === null) return 1;

  // Apply stale defaultTeam recovery.
  const recovered = resolveStaleDefaultTeam(settings, cwd, { homeDir: resolvedHomeDir() });
  if (recovered !== null) {
    settings.defaultTeam = recovered;
  }

  const teamId = parsed.team ?? settings.defaultTeam ?? BUILTIN_MINIMAL_TEAM_ID;
  if (parsed.team !== undefined && !teamInstalled(parsed.team, cwd)) {
    printError(
      `team '${parsed.team}' is not installed; checked .jie/teams/${parsed.team}/ and ~/.jie/teams/${parsed.team}/`,
    );
    return 1;
  }
  if (teamId !== BUILTIN_MINIMAL_TEAM_ID && !teamInstalled(teamId, cwd)) {
    printError(
      `team '${teamId}' is not installed; checked .jie/teams/${teamId}/ and ~/.jie/teams/${teamId}/`,
    );
    return 1;
  }

  // Open storage.
  const artifactsPath = projectArtifactsPath(cwd);
  const storage = new SqliteStorage(artifactsPath);

  // Read auth for getApiKey.
  const auth = loadAuthOrEmpty();
  const authGetApiKey = (provider: string): string | undefined => {
    const entry = auth[provider];
    if (entry === undefined) return undefined;
    if (entry.type === "api_key") return entry.key;
    return undefined;
  };
  // The auth.json entry wins; fall back to the registry's
  // `models.json`-resolved key (e.g. `$MY_API_KEY` env interpolation
  // for a custom provider). This makes the user's local LLM
  // config in `models.json` work end-to-end without writing to
  // `auth.json`.
  const registryFallback = ModelRegistry.load(cwd, { homeDir: resolvedHomeDir() });
  const getApiKey = hooks.getApiKey ?? (async (provider: string): Promise<string | undefined> => {
    const fromAuth = authGetApiKey(provider);
    if (fromAuth !== undefined) return fromAuth;
    return registryFallback.getApiKey(provider);
  });
  const finalSettings = hooks.settingsOverride ?? settings;

  // Resolve team blueprint eagerly to know the leader's role.
  let handle: JieHandle;
  try {
    handle = await startJie({
      workspace: cwd,
      settings: finalSettings,
      storage,
      teamId,
      resumeSessionId: parsed.resume,
      continueLastSession: parsed.continueLast,
      getApiKey,
      loadTeamBlueprint: hooks.loadTeamBlueprint,
      resolveModel: hooks.resolveModel,
      createAgent: hooks.createAgent,
    });
  } catch (e) {
    printError(e instanceof Error ? e.message : String(e));
    storage.close();
    return 1;
  }

  if (handle.bodies().length === 0) {
    printError(
      `team '${teamId}' has no agents to run; check the team manifest`,
    );
    await handle.stop();
    storage.close();
    return 1;
  }

  // Resolve leader. The handle flags the leader body with
  // `is_leader: true` (per `start.ts`: `soul.role === bp.leaderRole`),
  // so we look it up from the loaded bodies rather than guessing
  // from the alphabetically-sorted role list.
  const leader = handle.bodiesFor(teamId).find((b) => b.is_leader);
  if (leader === undefined) {
    printError(
      `team '${teamId}' has no leader; check TEAM.md's 'leader:' field`,
    );
    await handle.stop();
    storage.close();
    return 1;
  }
  const leaderRole = leader.soul.role;
  const leaderKey = leader.agent_key;

  // Set up stream filtering + idle gate.
  return runGate(handle, storage, {
    teamId,
    leaderRole,
    leaderKey,
    instruction: parsed.instruction,
    timeout: parsed.timeout,
    json: parsed.json,
  });
}

interface GateOptions {
  teamId: string;
  leaderRole: string;
  leaderKey: string;
  instruction: string;
  timeout: number;
  json: boolean;
}

async function runGate(
  handle: JieHandle,
  storage: SqliteStorage,
  opts: GateOptions,
): Promise<number> {
  // Stream filter.
  handle.bus.subscribe("agent.stream.chunk", (_subj, payload) => {
    const env = payload as AgentEvent;
    if (env.team_id !== opts.teamId) return;
    if (env.agent_role !== opts.leaderRole) return;
    const text = String(env.payload.text ?? "");
    if (opts.json) {
      const seq = Number(env.payload.seq ?? 0);
      process.stdout.write(JSON.stringify({ chunk: text, seq }) + "\n");
    } else {
      process.stdout.write(text);
    }
  });

  // Idle gate.
  const state = new Map<string, "busy" | "idle">();
  for (const b of handle.bodies()) state.set(b.agent_key, "idle");

  let resolveGate!: () => void;
  let rejectGate!: (err: Error) => void;
  const gate = new Promise<void>((resolve, reject) => {
    resolveGate = resolve;
    rejectGate = reject;
  });
  const timer =
    opts.timeout > 0
      ? setTimeout(() => rejectGate(new Error("timeout")), opts.timeout * 1000)
      : undefined;

  function evaluate(): void {
    if ([...state.values()].every((v) => v === "idle")) {
      if ([...state.keys()].length === 0) return;
      // The gate was initialized to all-idle; we don't open until
      // every body has done a turn_start → idle cycle.
      // We use a `seenBusy` set to enforce this.
      if (seenBusy.size === state.size) {
        if (timer !== undefined) clearTimeout(timer);
        resolveGate();
      }
    }
  }
  const seenBusy = new Set<string>();

  handle.bus.subscribe("agent.turn.start", (_subj, payload) => {
    const env = payload as AgentEvent;
    if (state.has(env.agent_key)) {
      state.set(env.agent_key, "busy");
      seenBusy.add(env.agent_key);
    }
  });
  handle.bus.subscribe("agent.idle", (_subj, payload) => {
    const env = payload as AgentEvent;
    if (state.has(env.agent_key)) {
      state.set(env.agent_key, "idle");
      evaluate();
    }
  });

  // Publish the prompt envelope.
  const envelope: AgentEvent = {
    version: 1,
    team_id: opts.teamId,
    event_type: "leader.prompt",
    agent_role: opts.leaderRole,
    agent_key: opts.leaderKey,
    timestamp: new Date().toISOString(),
    payload: { prompt: opts.instruction },
  };
  handle.bus.publish(`${opts.teamId}.leader.prompt`, envelope);

  try {
    await gate;
  } catch (e) {
    if (!opts.json) process.stdout.write("\n");
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "timeout") {
      printError(`no response from team within ${opts.timeout}s`);
    } else {
      printError(msg);
    }
    await handle.stop();
    storage.close();
    return 3;
  }
  if (!opts.json) process.stdout.write("\n");
  await handle.stop();
  storage.close();
  return 0;
}

// Exported for tests.
export { run as runCli, runPrint as runPrintCli };
export type { EventBus, PrintHooks, ParsedCli };

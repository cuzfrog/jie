import { createEventManager, Events, type EventEnvelope, type EventManager, type Sender, type EventType } from "@cuzfrog/jie-platform/event";
import { createTui, type Tui, type TuiDeps, type CreateTUIOptions } from "@cuzfrog/jie-tui";
import type { AuthStore, SettingsStore, Scope } from "@cuzfrog/jie-platform/config";
import type { TeamRegistry } from "@cuzfrog/jie-platform/team";
import type { GitService, GitSnapshot } from "@cuzfrog/jie-platform/services";
import { JiePlatformErrorMessages } from "@cuzfrog/jie-platform";
import { withTTY } from "../../support";

const noopAsync = (): Promise<void> => Promise.resolve();

const stubAuthStore: AuthStore = {
  load: () => ({}),
  saveAuthConfig: () => {},
  setProvider: (auth) => auth,
  removeProvider: (auth) => auth,
  clear: () => ({}),
};

const stubSettingsStore: SettingsStore = {
  load: () => ({}),
  write: () => {},
  unsetDefaultTeam: () => {},
};

const stubTeamRegistry: TeamRegistry = {
  parseTeamManifest: () => undefined as never,
  isInstalled: () => false,
  listInstalled: () => [],
  locate: () => "missing",
};

const stubGitSnapshot: GitSnapshot = { branch: "", dirty: false, ahead: 0, behind: 0 };

const stubGitService: GitService = {
  getSnapshot: () => stubGitSnapshot,
};

function makeDeps(bus: EventManager, options: CreateTUIOptions): { deps: TuiDeps; options: CreateTUIOptions } {
  return {
    deps: {
      eventManager: bus,
      teamRegistry: stubTeamRegistry,
      loadTeam: noopAsync,
      authStore: stubAuthStore,
      gitService: stubGitService,
      settingsStore: stubSettingsStore,
      settingsScope: "global" as Scope,
    },
    options,
  };
}

export const startTuiOn = (
  bus: EventManager,
  preload: ReadonlyArray<EventEnvelope<EventType>>,
  options: Omit<CreateTUIOptions, "cwd"> = {},
): Tui => {
  const opts: CreateTUIOptions = { ...options, cwd: process.cwd() };
  const { deps } = makeDeps(bus, opts);
  const tuiHandle: { current: Tui | null } = { current: null };
  withTTY(true, () => { tuiHandle.current = createTui(deps, opts); });
  const tui = tuiHandle.current;
  if (tui === null) throw new Error("TUI handle not initialized");
  for (const env of preload) bus.publish(env);
  return tui;
};

export const replayEnvelopes = (
  envelopes: ReadonlyArray<EventEnvelope<EventType>>,
): { tui: Tui; bus: EventManager } => {
  const bus = createEventManager();
  const tui = startTuiOn(bus, envelopes);
  return { tui, bus };
};

export const NO_MODEL_ERROR = JiePlatformErrorMessages.NO_MODEL_ERROR;

export const attachNoModelBody = (
  bus: EventManager,
  teamId: string,
  agentKey: string,
  role: string,
): (() => void) => {
  const agentSender: Sender = { kind: "agent", identity: { teamId, agentRole: role, agentKey } };
  const unsubscribe = bus.subscribe("user.prompt", (env) => {
    if (env.payload === null || typeof env.payload !== "object") return;
    const payload = env.payload as { teamId?: unknown; agentKey?: unknown };
    if (payload.teamId !== teamId || payload.agentKey !== agentKey) return;
    bus.publish(Events.agentIdle(agentSender, "error"));
    bus.publish(Events.systemError({ kind: "system" }, NO_MODEL_ERROR));
  });
  return unsubscribe;
};

export const loadFixture = async (name: string): Promise<EventEnvelope<EventType>[]> => {
  const path = `${import.meta.dir}/fixtures/${name}.jsonl`;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`fixture not found: ${path}`);
  }
  const text = await file.text();
  const out: EventEnvelope<EventType>[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    out.push(JSON.parse(trimmed) as EventEnvelope<EventType>);
  }
  return out;
};

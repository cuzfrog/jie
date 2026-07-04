import { createEventManager, Events, type EventEnvelope, type EventManager, type AgentSender, type EventType } from "@cuzfrog/jie-platform/event";
import { createTui, type Tui, type TuiDeps, type CreateTUIOptions } from "@cuzfrog/jie-tui";
import type { JiePlatform } from "@cuzfrog/jie-platform";
import type { GitSnapshot } from "@cuzfrog/jie-platform/services";
import { withTTY } from "../../support";

const noopAsync = (): Promise<void> => Promise.resolve();

const stubGitSnapshot: GitSnapshot = { branch: "", dirty: false, ahead: 0, behind: 0 };

function makePlatform(bus: EventManager, initialTeamId: string): JiePlatform {
  const team: { id: string; agents: ReadonlyArray<never> } = { id: initialTeamId, agents: [] };
  return {
    team: team as unknown as JiePlatform["team"],
    loadTeam: async (id: string) => {
      (team as { id: string }).id = id;
    },
    stop: noopAsync,
    subscribe: <T extends EventType>(topic: T, cb: (event: EventEnvelope<T>) => void) => bus.subscribe(topic, cb),
    prompt: (agentKey: string, text: string) => {
      bus.publish(Events.userPrompt({ kind: "user" }, team.id, text, agentKey));
    },
    interrupt: () => undefined,
    getDefaultTeam: () => null,
    getDefaultModel: () => null,
    listInstalledTeams: () => [],
    getGitStatus: () => stubGitSnapshot,
    command: stubCommandDispatcher,
  };
}

function stubCommandDispatcher(): Promise<never> {
  return Promise.reject(new Error("command dispatcher is not stubbed in e2e harness"));
}

function makeDeps(bus: EventManager, options: CreateTUIOptions, initialTeamId: string = "minimal"): { deps: TuiDeps; options: CreateTUIOptions } {
  return {
    deps: {
      platform: makePlatform(bus, initialTeamId),
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
  const initialTeamId = (() => {
    for (const e of preload) {
      if (e.type !== "system.team.loaded") continue;
      const payload = e.payload;
      if (payload !== null && typeof payload === "object" && "teamId" in payload) {
        const teamId = (payload as { teamId: unknown }).teamId;
        if (typeof teamId === "string") return teamId;
      }
    }
    return "minimal";
  })();
  const { deps } = makeDeps(bus, opts, initialTeamId);
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

export const attachNoModelBody = (
  bus: EventManager,
  teamId: string,
  agentKey: string,
): (() => void) => {
  const agentSender: AgentSender = { kind: "agent", teamId, agentKey };
  const unsubscribe = bus.subscribe("user.prompt", (env) => {
    if (env.payload === null || typeof env.payload !== "object") return;
    const payload = env.payload as { teamId?: unknown; agentKey?: unknown };
    if (payload.teamId !== teamId || payload.agentKey !== agentKey) return;
    bus.publish(Events.agentIdle(agentSender, "error"));
    bus.publish(Events.systemError({ kind: "system" }, "No model has been selected"));
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
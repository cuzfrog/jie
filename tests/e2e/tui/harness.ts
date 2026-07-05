import { Events, type EventEnvelope, type AgentSender, type EventType, type GitSnapshot, type JiePlatform } from "@cuzfrog/jie-platform";
import { createTui, type Tui, type TuiDeps, type CreateTUIOptions } from "@cuzfrog/jie-tui";
import { withTTY } from "../../support";

const noopAsync = (): Promise<void> => Promise.resolve();

const stubGitSnapshot: GitSnapshot = { branch: "", dirty: false, ahead: 0, behind: 0 };

type Publish = <T extends EventType>(env: EventEnvelope<T>) => void;
type Subscribe = <T extends EventType>(topic: T, cb: (event: EventEnvelope<T>) => void) => () => void;
type SubscriberCount = (subject: string) => number;

interface TestBus {
  publish: Publish;
  subscribe: Subscribe;
  subscriberCount: SubscriberCount;
}

function makePlatform(publish: Publish, subscribe: Subscribe, initialTeamId: string): JiePlatform {
  const execute: JiePlatform["execute"] = async (cmd) => {
    switch (cmd.name) {
      case "setDefaultTeam":
        return null;
      case "unsetDefaultTeam":
        return null;
      case "getTeamInfo":
        return { defaultTeam: null, installed: [] };
      case "getGitStatus":
        return stubGitSnapshot;
      default:
        return null;
    }
  };
  return {
    settings: {},
    loadTeam: async (teamId?: string) => {
      const id = teamId ?? initialTeamId;
      return { id, leaderKey: `${id}-leader`, agents: [] };
    },
    stop: noopAsync,
    subscribe,
    prompt: (teamId: string, agentKey: string, text: string) => {
      publish(Events.userPrompt({ kind: "user" }, teamId, text, agentKey));
    },
    interrupt: () => undefined,
    execute,
  };
}

function makeBus(): TestBus {
  const handlers = new Map<EventType, Set<(env: EventEnvelope<EventType>) => void>>();
  const publish: Publish = (env) => {
    const subs = handlers.get(env.type);
    if (subs === undefined) return;
    for (const cb of subs) cb(env as EventEnvelope<EventType>);
  };
  const subscribe: Subscribe = (topic, cb) => {
    let subs = handlers.get(topic);
    if (subs === undefined) {
      subs = new Set();
      handlers.set(topic, subs);
    }
    subs.add(cb as (env: EventEnvelope<EventType>) => void);
    return () => {
      const current = handlers.get(topic);
      if (current !== undefined) current.delete(cb as (env: EventEnvelope<EventType>) => void);
    };
  };
  const subscriberCount: SubscriberCount = (subject) => handlers.get(subject as EventType)?.size ?? 0;
  return { publish, subscribe, subscriberCount };
}

function makeDeps(bus: TestBus, options: CreateTUIOptions, initialTeamId: string = "minimal"): { deps: TuiDeps; options: CreateTUIOptions } {
  return {
    deps: {
      platform: makePlatform(bus.publish, bus.subscribe, initialTeamId),
    },
    options,
  };
}

export const startTuiOn = (
  bus: TestBus,
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
): { tui: Tui; bus: TestBus } => {
  const bus = makeBus();
  const tui = startTuiOn(bus, envelopes);
  return { tui, bus };
};

export const attachNoModelBody = (
  bus: TestBus,
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

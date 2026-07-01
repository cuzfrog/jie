import { createEventManager, Events, type EventEnvelope, type EventManager, type Sender, type EventType } from "@cuzfrog/jie-platform/event";
import { createTui, type Tui, type CreateTUIOptions } from "@cuzfrog/jie-tui";
import type { ArtifactStore } from "@cuzfrog/jie-platform/storage";
import { NO_MODEL_ERROR as NO_MODEL_ERROR_TEXT } from "../../../packages/jie-platform/no-model-error.ts";

const stubArtifacts: ArtifactStore = {
  write: async () => ({ key: "", created_at: "" }),
  read: async () => null,
  list: async () => [],
};

export const withTTY = (value: boolean, action: () => void): void => {
  const original = process.stdin.isTTY;
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
  try {
    action();
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: original, configurable: true });
  }
};

export const startTuiOn = (
  bus: EventManager,
  preload: ReadonlyArray<EventEnvelope<EventType>>,
): Tui => {
  const opts: CreateTUIOptions = {
    bus,
    artifacts: stubArtifacts,
    roles: [],
    cols: 80,
    rows: 30,
    cwd: "/tmp",
    branch: "main",
  };
  const tuiHandle: { current: Tui | null } = { current: null };
  withTTY(true, () => { tuiHandle.current = createTui(opts); });
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

export const NO_MODEL_ERROR = NO_MODEL_ERROR_TEXT;

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
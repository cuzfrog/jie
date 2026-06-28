import { createEventManager, type EventEnvelope } from "@cuzfrog/jie-platform/event";
import { startTUI, type Tui, type StartTUIOptions } from "@cuzfrog/jie-tui";
import type { ArtifactStore } from "@cuzfrog/jie-platform/storage";

const stubArtifacts: ArtifactStore = {
  write: async () => ({ key: "", created_at: "" }),
  read: async () => null,
  list: async () => [],
};

export const withTTY = (value: boolean, fn: () => void): void => {
  const original = process.stdin.isTTY;
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: original, configurable: true });
  }
};

export const replayEnvelopes = (envelopes: ReadonlyArray<EventEnvelope>): { tui: Tui } => {
  const bus = createEventManager();
  const opts: StartTUIOptions = {
    bus,
    artifacts: stubArtifacts,
    roles: [],
    cols: 80,
    rows: 30,
    cwd: "/tmp",
    branch: "main",
  };
  let tui: Tui | null = null;
  withTTY(true, () => { tui = startTUI(opts); });
  if (tui === null) throw new Error("TUI handle not initialized");
  for (const env of envelopes) bus.publish(env);
  return { tui };
};

export const loadFixture = async (name: string): Promise<EventEnvelope[]> => {
  const path = `${import.meta.dir}/fixtures/${name}.jsonl`;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`fixture not found: ${path}`);
  }
  const text = await file.text();
  const out: EventEnvelope[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    out.push(JSON.parse(trimmed) as EventEnvelope);
  }
  return out;
};

import type { JiePlatform } from "@cuzfrog/jie-platform";
import { Events, type EventManager, type Sender } from "@cuzfrog/jie-platform/event";
import type { ParsedArgsMap } from "../cli-flags.ts";

export type PrintArgs = ParsedArgsMap["print"];

export async function runPrint(
  handle: JiePlatform,
  teamId: string,
  leaderRole: string,
  leaderKey: string,
  agentKeys: string[],
  args: PrintArgs,
): Promise<number> {
  handle.events.subscribe("agent.stream.chunk", (env: { sender: Sender; payload: { text: string; seq: number } }) => {
    if (env.sender.kind !== "agent") return;
    if (env.sender.identity.teamId !== teamId) return;
    if (env.sender.identity.agentRole !== leaderRole) return;
    const text = env.payload.text;
    if (args.json) {
      process.stdout.write(JSON.stringify({ chunk: text, seq: env.payload.seq }) + "\n");
    } else {
      process.stdout.write(text);
    }
  });

  handle.events.publish(Events.userPrompt({ kind: "cli" }, teamId, args.instruction, leaderKey));

  try {
    await setupIdleGate(handle.events, agentKeys, args.timeout);
  } catch (e) {
    if (!args.json) process.stdout.write("\n");
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "timeout") {
      console.error(`no response from team within ${args.timeout}s`);
    } else {
      console.error(msg);
    }
    await handle.stop();
    return 3;
  }
  if (!args.json) process.stdout.write("\n");
  await handle.stop();
  return 0;
}

function setupIdleGate(events: EventManager, agentKeys: string[], timeoutSec: number): Promise<void> {
  const state = new Map<string, "busy" | "idle">();
  for (const k of agentKeys) state.set(k, "idle");

  let resolve!: () => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const timer =
    timeoutSec > 0
      ? setTimeout(() => reject(new Error("timeout")), timeoutSec * 1000)
      : undefined;

  const agentKeyOf = (env: { sender: Sender }): string | null =>
    env.sender.kind === "agent" ? env.sender.identity.agentKey : null;

  const evaluate = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    unsubTurnStart();
    unsubIdle();
    resolve();
  };

  const unsubTurnStart = events.subscribe("agent.turn.start", (env) => {
    const k = agentKeyOf(env);
    if (k !== null && state.has(k)) state.set(k, "busy");
  });
  const unsubIdle = events.subscribe("agent.idle", (env) => {
    const k = agentKeyOf(env);
    if (k !== null && state.has(k)) {
      state.set(k, "idle");
      if ([...state.values()].every((v) => v === "idle")) evaluate();
    }
  });

  return promise;
}

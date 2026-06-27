import type { JiePlatform } from "@cuzfrog/jie-platform";
import { Events, type EventManager, type Sender } from "@cuzfrog/jie-platform/event";
import type { ParsedArgsMap } from "../cli-flags";

export type PrintArgs = ParsedArgsMap["print"];

export async function runPrint(
  handle: JiePlatform,
  teamId: string,
  leaderRole: string,
  leaderKey: string,
  agentKeys: string[],
  args: PrintArgs,
): Promise<number> {
  handle.events.subscribe("agent.stream.chunk", (envelope: { sender: Sender; payload: { text: string; seq: number } }) => {
    if (envelope.sender.kind !== "agent") return;
    if (envelope.sender.identity.teamId !== teamId) return;
    if (envelope.sender.identity.agentRole !== leaderRole) return;
    const text = envelope.payload.text;
    if (args.json) {
      process.stdout.write(JSON.stringify({ chunk: text, seq: envelope.payload.seq }) + "\n");
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
  for (const agentKey of agentKeys) state.set(agentKey, "idle");

  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const timer =
    timeoutSec > 0
      ? setTimeout(() => reject(new Error("timeout")), timeoutSec * 1000)
      : undefined;

  const agentKeyOf = (envelope: { sender: Sender }): string | null =>
    envelope.sender.kind === "agent" ? envelope.sender.identity.agentKey : null;

  const evaluate = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    unsubTurnStart();
    unsubIdle();
    resolve();
  };

  const unsubTurnStart = events.subscribe("agent.turn.start", (envelope) => {
    const agentKey = agentKeyOf(envelope);
    if (agentKey !== null && state.has(agentKey)) state.set(agentKey, "busy");
  });
  const unsubIdle = events.subscribe("agent.idle", (envelope) => {
    const agentKey = agentKeyOf(envelope);
    if (agentKey !== null && state.has(agentKey)) {
      state.set(agentKey, "idle");
      if ([...state.values()].every((v) => v === "idle")) evaluate();
    }
  });

  return promise;
}

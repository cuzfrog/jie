import type { JiePlatform } from "@cuzfrog/jie-platform";
import { Events, type EventManager, type Sender } from "@cuzfrog/jie-platform/event";
import type { ParsedArgsMap } from "../cli-flags.ts";

export type PrintArgs = ParsedArgsMap["print"];

export async function runPrint(
  handle: JiePlatform,
  teamId: string,
  leaderRole: string,
  leaderKey: string,
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
    await setupIdleGate(handle.events, leaderKey, args.timeout);
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

function setupIdleGate(events: EventManager, leaderKey: string, timeoutSec: number): Promise<void> {
  let leaderBusy = false;
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

  const isLeader = (env: { sender: Sender }): boolean =>
    env.sender.kind === "agent" && env.sender.identity.agentKey === leaderKey;

  const unsubTurnStart = events.subscribe("agent.turn.start", (env) => {
    if (isLeader(env)) leaderBusy = true;
  });
  const unsubIdle = events.subscribe("agent.idle", (env) => {
    if (isLeader(env)) {
      leaderBusy = false;
      if (timer !== undefined) clearTimeout(timer);
      unsubTurnStart();
      unsubIdle();
      resolve();
    }
  });

  return promise;
}
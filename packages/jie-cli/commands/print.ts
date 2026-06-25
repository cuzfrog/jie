import type { JiePlatform } from "@cuzfrog/jie-platform";
import { Events, type EventManager, type Sender } from "@cuzfrog/jie-platform/core";
import type { ParsedArgsMap } from "../cli-flags.ts";

export type PrintArgs = ParsedArgsMap["print"];

export async function runPrint(
  handle: JiePlatform,
  teamId: string,
  leaderRole: string,
  leaderKey: string,
  args: PrintArgs,
): Promise<number> {
  const leaderSender: Sender = {
    kind: "agent",
    identity: { teamId, agentRole: leaderRole, agentKey: leaderKey },
  };
  handle.events.subscribe("agent.stream.chunk", (env) => {
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

  handle.events.publish(Events.envelope(leaderSender, `${teamId}.leader.prompt`, { prompt: args.instruction }));

  try {
    await setupIdleGate(handle.events, args.timeout);
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

function setupIdleGate(events: EventManager, timeoutSec: number): Promise<void> {
  let busy = 0;
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

  events.subscribe("agent.turn.start", () => {
    busy++;
  });
  events.subscribe("agent.idle", () => {
    busy--;
    if (busy === 0) {
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    }
  });

  return promise;
}
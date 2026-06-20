
import type { JiePlatform } from "@cuzfrog/jie-platform";
import type { AgentEvent, EventBus } from "@cuzfrog/jie-platform/core";
import type { ParsedArgs } from "../index.ts";

export type PrintArgs = Extract<ParsedArgs, { kind: "print" }>;

export async function runPrint(
  handle: JiePlatform,
  teamId: string,
  leaderRole: string,
  leaderKey: string,
  args: PrintArgs,
): Promise<number> {
  handle.bus.subscribe("agent.stream.chunk", (_subj, payload) => {
    const agentEvent = payload as AgentEvent;
    if (agentEvent.team_id !== teamId) return;
    if (agentEvent.agent_role !== leaderRole) return;
    const text = String(agentEvent.payload.text ?? "");
    if (args.json) {
      const seq = Number(agentEvent.payload.seq ?? 0);
      process.stdout.write(JSON.stringify({ chunk: text, seq }) + "\n");
    } else {
      process.stdout.write(text);
    }
  });

  const envelope: AgentEvent = {
    version: 1,
    team_id: teamId,
    event_type: "leader.prompt",
    agent_role: leaderRole,
    agent_key: leaderKey,
    timestamp: new Date().toISOString(),
    payload: { prompt: args.instruction },
  };
  handle.bus.publish(`${teamId}.leader.prompt`, envelope);

  try {
    await setupIdleGate(handle.bus, args.timeout);
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

function setupIdleGate(bus: EventBus, timeoutSec: number): Promise<void> {
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

  bus.subscribe("agent.turn.start", () => {
    busy++;
  });
  bus.subscribe("agent.idle", () => {
    busy--;
    if (busy === 0) {
      if (timer !== undefined) clearTimeout(timer);
      resolve();
    }
  });

  return promise;
}

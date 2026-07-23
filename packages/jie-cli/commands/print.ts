import { type JiePlatform, type TeamInfo } from "@cuzfrog/jie-platform";
import { type Console } from "@cuzfrog/jie-utils";
import type { ParsedArgsMap } from "../cli-flags";

export type PrintArgs = ParsedArgsMap["print"];

export async function runPrint(
  handle: JiePlatform,
  team: TeamInfo,
  args: PrintArgs,
  console: Console,
): Promise<number> {
  const agentKeys = team.agents.map((a) => a.agentKey);
  handle.subscribe("agent.stream.chunk", (envelope) => {
    if (envelope.sender.kind !== "agent") return;
    if (envelope.sender.teamId !== team.id) return;
    if (envelope.sender.agentKey !== team.leaderKey) return;
    const text = envelope.payload.text;
    if (args.json) {
      console.write(JSON.stringify({ chunk: text, seq: envelope.payload.seq }) + "\n");
    } else {
      console.write(text);
    }
  });

  handle.prompt(team.id, team.leaderKey, args.instruction);

  try {
    await setupIdleGate(handle, agentKeys, args.timeout);
  } catch (error) {
    if (!args.json) console.write("\n");
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage === "timeout") {
      console.error(`no response from team within ${args.timeout}s`);
    } else {
      console.error(errorMessage);
    }
    await handle.execute({ name: "stop" });
    return 3;
  }
  if (!args.json) console.write("\n");
  await handle.execute({ name: "stop" });
  return 0;
}

function setupIdleGate(handle: JiePlatform, agentKeys: ReadonlyArray<string>, timeoutSec: number): Promise<void> {
  const state = new Map<string, "busy" | "idle">();
  for (const agentKey of agentKeys) state.set(agentKey, "idle");

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const unsubTurnStart = handle.subscribe("agent.turn.start", (envelope) => {
      if (envelope.sender.kind !== "agent") return;
      if (!state.has(envelope.sender.agentKey)) return;
      state.set(envelope.sender.agentKey, "busy");
    });
    const unsubIdle = handle.subscribe("agent.idle", (envelope) => {
      if (envelope.sender.kind !== "agent") return;
      if (!state.has(envelope.sender.agentKey)) return;
      state.set(envelope.sender.agentKey, "idle");
      let allIdle = true;
      for (const v of state.values()) {
        if (v !== "idle") { allIdle = false; break; }
      }
      if (allIdle) finish(undefined);
    });

    const timer =
      timeoutSec > 0
        ? setTimeout(() => finish(new Error("timeout")), timeoutSec * 1000)
        : undefined;

    function finish(result: Error | undefined): void {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      unsubTurnStart();
      unsubIdle();
      if (result === undefined) resolve();
      else reject(result);
    }
  });
}

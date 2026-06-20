/** `jie -p` (print mode) — the one-shot prompt branch of jie-cli.
 *
 *  This module is the `-p` flow over a started `JieHandle`. It
 *  does NOT own the platform's `createJiePlatform`; that lives
 *  in `app.ts:createApp` and is shared with the future TUI
 *  branch. `runPrint` receives a started handle from the
 *  dispatcher (`index.ts`) plus the team info captured by
 *  `createApp` from the bus's `team.loaded` event, and runs the
 *  print pipeline:
 *
 *    1. Subscribe to the leader's `agent.stream.chunk` and
 *       forward text (or JSON) to stdout.
 *    2. Publish the `leader.prompt` envelope.
 *    3. Open the idle gate; exit when the gate opens or the
 *       timeout fires. The gate is a single `busy` counter on
 *       `agent.turn.start` / `agent.idle` — see `setupIdleGate`.
 *
 *  The TUI branch (currently a stub in `index.ts`) is a sibling
 *  consumer of `createApp`. It will subscribe to events and
 *  run continuously; it does not call `runPrint`.
 */
import type { JiePlatform } from "@cuzfrog/jie-platform";
import type { AgentEvent, EventBus } from "@cuzfrog/jie-platform/core";
import type { ParsedArgs } from "../index.ts";

export type PrintArgs = Extract<ParsedArgs, { kind: "print" }>;

/** Run the `-p` flow over a started `JieHandle`.
 *
 *  `handle` is the started platform handle (from `createApp`).
 *  `teamId`, `leaderRole`, `leaderKey` are the team info
 *  captured by `createApp` from the bus's `team.loaded` event.
 *  The `JiePlatform` surface is intentionally minimal (just
 *  `bus` and `stop`); the team info comes through the bus.
 *  `args` is the `-p`-specific parsed CLI args (instruction,
 *  timeout, json).
 *
 *  Returns the process exit code:
 *    - `0` on clean gate open.
 *    - `3` on gate timeout. */
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

/** The CLI's idle gate for `-p` mode.
 *
 *  Resolves when the bus has observed as many `agent.idle` events
 *  as `agent.turn.start` events (the `busy` counter returns to 0).
 *  Rejects with `Error("timeout")` if `timeoutSec` > 0 and the gate
 *  has not opened in that wall-clock window.
 *
 *  The counter is correct because the Event-Order Contract
 *  (`doc/specs/jie-platform/03-event-system.md` "Event-Order
 *  Contract", and `doc/addrs/22-event-order-contract.md`)
 *  guarantees that whenever work is in flight, the bus sees a
 *  matching `turn_start` before the corresponding `idle`. A
 *  notifying body (e.g. the leader calling `notify`) starts the
 *  recipient's turn synchronously inside the notify call — the
 *  recipient's `turn_start` is published before the notifier's
 *  `notify` tool returns, so before the notifier's `idle`. The
 *  counter is therefore always ≥ 1 while work is in flight, and
 *  returns to 0 only when all in-flight turns have ended.
 *
 *  The gate's `resolve` is only called from inside the
 *  `agent.idle` handler, so if no body ever responds the gate
 *  stays pending and the timeout fires.
 */
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

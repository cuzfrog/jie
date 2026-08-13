import { ulid } from "ulid";
import type { AgentBody } from "../core";
import type { EventManager } from "../event";
import { Events } from "../event";
import { JiePlatformError } from "../jie-platform-errors";
import type { AgentRegistry } from "./agent-registry";
import type { AgentDispatcher, CallAgentRequest, CallAgentTicket } from "../types";
import type { TeamManager } from "./team-manager";
import type { TeamRegistry } from "./registry";

interface PendingCall {
  readonly callId: string;
  readonly callbackTopic: string;
  readonly callerAgentKey: string;
  readonly prompt: string;
  readonly reset: boolean;
  readonly teamId: string;
  readonly sessionId: string;
}

interface ActiveCall extends PendingCall {
  notified: boolean;
}

interface ResolvedTarget {
  readonly agentKey: string;
  readonly body: AgentBody | undefined;
}

export class AgentDispatcherImpl implements AgentDispatcher {
  private readonly running = new Map<string, boolean>();
  private readonly queueLengths = new Map<string, number>();
  private readonly pending = new Map<string, PendingCall[]>();
  private readonly active = new Map<string, ActiveCall>();
  private readonly processing = new Set<string>();

  constructor(
    private readonly teamManager: TeamManager,
    private readonly eventManager: EventManager,
    private readonly teamRegistry: TeamRegistry,
    private readonly agentRegistry: AgentRegistry,
  ) {
    this.eventManager.subscribe("agent.turn.start", (env) => {
      this.running.set(env.sender.agentKey, true);
    });
    this.eventManager.subscribe("agent.idle", (env) => {
      const agentKey = env.sender.agentKey;
      this.running.set(agentKey, false);
      this.queueLengths.set(agentKey, 0);
      const call = this.active.get(agentKey);
      if (call !== undefined && !call.notified) {
        this.publishFailure(agentKey, call, `ended without a result (reason: ${String(env.payload)})`);
      }
      this.active.delete(agentKey);
      void this.processQueue(agentKey);
    });
    this.eventManager.subscribe("agent.prompt.queue.update", (env) => {
      this.queueLengths.set(env.sender.agentKey, env.payload.prompts.length);
    });
    this.eventManager.subscribe("agent.tool.result", (env) => {
      const agentKey = env.sender.agentKey;
      const call = this.active.get(agentKey);
      if (call === undefined) return;
      const details = env.payload.details;
      if (details !== null && "topic" in details && typeof details.topic === "string" && details.topic === call.callbackTopic) {
        call.notified = true;
      }
    });
  }

  call(request: CallAgentRequest): CallAgentTicket {
    const resolved = this.resolveTarget(request.teamId, request.agent);
    if (resolved.agentKey === request.callerAgentKey) {
      throw new JiePlatformError("CALL_AGENT_SELF", {
        detail: `agent '${request.agent}' resolves to the caller; self-calls are not allowed`,
      });
    }
    const callId = ulid();
    const callbackTopic = `callback.${request.callerAgentKey}`;
    const pending: PendingCall = {
      callId,
      callbackTopic,
      callerAgentKey: request.callerAgentKey,
      prompt: request.prompt,
      reset: request.reset === true,
      teamId: request.teamId,
      sessionId: request.sessionId,
    };
    const queue = this.pending.get(resolved.agentKey) ?? [];
    queue.push(pending);
    this.pending.set(resolved.agentKey, queue);
    const queued = !this.canDispatchNow(resolved.agentKey, resolved.body);
    const ticket: CallAgentTicket = { agentKey: resolved.agentKey, callbackTopic, callId, queued };
    void this.processQueue(resolved.agentKey);
    return ticket;
  }

  private resolveTarget(teamId: string, agentRef: string): ResolvedTarget {
    const bodies = this.teamManager.bodies(teamId);
    const exact = bodies.find((b) => b.identity.agentKey === agentRef);
    if (exact !== undefined) return { agentKey: exact.identity.agentKey, body: exact };
    const blueprint = this.teamRegistry.parseTeamManifest(teamId);
    const roleSoul = blueprint.roles.find((s) => s.role === agentRef);
    if (roleSoul !== undefined) {
      const roleBodies = bodies.filter((b) => b.identity.role === agentRef);
      if (roleBodies.length > 0) {
        const target = this.selectRoleReplica(roleBodies);
        return { agentKey: target.identity.agentKey, body: target };
      }
    }
    if (this.agentRegistry.locate(agentRef) !== null) {
      return { agentKey: agentRef, body: undefined };
    }
    throw new JiePlatformError("AGENT_NOT_FOUND", {
      detail: `agent '${agentRef}' is not a loaded agent, team role, or installed shared agent`,
    });
  }

  private selectRoleReplica(bodies: ReadonlyArray<AgentBody>): AgentBody {
    const scored = bodies.map((body) => {
      const agentKey = body.identity.agentKey;
      const idle = this.canDispatchNow(agentKey, body);
      const pending = this.pending.get(agentKey)?.length ?? 0;
      return { body, idle, pending };
    });
    scored.sort((a, b) => {
      if (a.idle !== b.idle) return a.idle ? -1 : 1;
      return a.pending - b.pending;
    });
    return scored[0]!.body;
  }

  private canDispatchNow(agentKey: string, body: AgentBody | undefined): boolean {
    if (body === undefined) return false;
    if (this.active.has(agentKey)) return false;
    if (this.running.get(agentKey) === true) return false;
    if ((this.queueLengths.get(agentKey) ?? 0) > 0) return false;
    return true;
  }

  private async processQueue(agentKey: string): Promise<void> {
    if (this.processing.has(agentKey)) return;
    this.processing.add(agentKey);
    try {
      while (true) {
        if (this.active.has(agentKey)) return;
        const queue = this.pending.get(agentKey);
        if (queue === undefined || queue.length === 0) return;
        const teamId = queue[0]!.teamId;
        const body = await this.resolveBody(teamId, agentKey);
        if (body === null) return;
        if (!this.canDispatchNow(agentKey, body)) return;
        const call = queue.shift()!;
        if (call.reset) {
          await this.teamManager.resetAgent(teamId, agentKey);
        }
        this.dispatchCall(call, agentKey);
      }
    } finally {
      this.processing.delete(agentKey);
    }
  }

  private async resolveBody(teamId: string, agentKey: string): Promise<AgentBody | null> {
    const loaded = this.teamManager.bodies(teamId).find((b) => b.identity.agentKey === agentKey);
    if (loaded !== undefined) return loaded;
    try {
      return await this.teamManager.spawnAdHoc(teamId, agentKey);
    } catch (error) {
      const queue = this.pending.get(agentKey);
      if (queue !== undefined) {
        const failed = queue.shift();
        if (failed !== undefined) {
          this.publishFailure(agentKey, { ...failed, notified: false }, error instanceof Error ? error.message : String(error));
        }
      }
      return null;
    }
  }

  private dispatchCall(call: PendingCall, targetAgentKey: string): void {
    const teamId = call.teamId;
    const body = this.teamManager.bodies(teamId).find((b) => b.identity.agentKey === targetAgentKey);
    if (body === undefined || !this.hasNotifyTool(body)) {
      this.publishFailure(targetAgentKey, { ...call, notified: false }, "target agent does not have the notify tool");
      return;
    }
    const message = `call_id: ${call.callId}\ncallback: ${call.callbackTopic}\n\n${call.prompt}`;
    this.eventManager.publish(
      Events.custom(
        { kind: "agent", teamId, agentKey: call.callerAgentKey },
        `${teamId}.inbox.${targetAgentKey}`,
        message,
      ),
    );
    this.active.set(targetAgentKey, { ...call, notified: false });
  }

  private hasNotifyTool(body: AgentBody): boolean {
    return body.identity.tools.some((tool) => tool === "notify" || tool.startsWith("notify("));
  }

  private publishFailure(agentKey: string, call: ActiveCall, reason: string): void {
    const message = `call_id: ${call.callId}\ncall to ${agentKey} failed: ${reason}`;
    this.eventManager.publish(
      Events.custom(
        { kind: "agent", teamId: call.teamId, agentKey },
        `${call.teamId}.${call.callbackTopic}`,
        message,
      ),
    );
    this.active.delete(agentKey);
  }
}

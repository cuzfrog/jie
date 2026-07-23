import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentSoul } from "../team";
import type { AgentInfo } from "../types";

export interface AgentBodyParams {
  readonly agentKey: string;
  readonly teamId: string;
  readonly soul: AgentSoul;
  readonly isLeader: boolean;
  readonly sessionId: string;
  readonly model: Model<Api> | undefined;
}

export interface AgentBody {
  readonly identity: AgentInfo;
  restore(): Promise<ReadonlyArray<AgentMessage>>;
  start(): Promise<void>;
  stop(): void;
}

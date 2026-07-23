import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentInfo } from "../types";

export interface AgentBodyParams {
  readonly agentKey: string;
  readonly teamId: string;
  readonly soul: {
    readonly role: string;
    readonly systemPrompt: string;
    readonly tools: ReadonlyArray<string>;
    readonly subscribe: ReadonlyArray<string>;
  };
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

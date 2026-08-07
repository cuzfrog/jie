import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { Memory } from "./memory-store";
import type { MemoryBootstrap } from "./memory-bootstrap";
import type { MemoryDistiller } from "./memory-distiller";
import type { MemoryStore } from "./memory-store";

export interface DistillationInput {
  readonly messages: ReadonlyArray<AgentMessage>;
  readonly teamId: string;
  readonly sessionId: string;
  readonly model: Model<Api>;
  readonly signal?: AbortSignal;
}

export interface MemoryManager {
  search(query: string, teamId: string, limit: number): ReadonlyArray<Memory>;
  bootstrap(teamId: string): string;
  distill(input: DistillationInput): Promise<void>;
}

export class MemoryManagerImpl implements MemoryManager {
  constructor(
    private readonly memoryStore: MemoryStore,
    private readonly memoryDistiller: MemoryDistiller,
    private readonly memoryBootstrap: MemoryBootstrap,
  ) {}

  search(query: string, teamId: string, limit: number): ReadonlyArray<Memory> {
    return this.memoryStore.search(query, teamId, limit);
  }

  bootstrap(teamId: string): string {
    return this.memoryBootstrap.render(teamId);
  }

  distill(input: DistillationInput): Promise<void> {
    return this.memoryDistiller.distill(input);
  }
}

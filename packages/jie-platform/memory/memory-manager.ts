import type { Memory, MemoryStore } from "./memory-store";
import type { MemoryBootstrap } from "./memory-bootstrap";
import type { MemoryDistiller, DistillationInput } from "./memory-distiller";

export interface MemoryManager {
  search(query: string, teamId: string, limit: number): ReadonlyArray<Memory>;
  bootstrap(teamId: string): string;
  distill(input: DistillationInput): Promise<void>;
}

export class MemoryManagerImpl implements MemoryManager {
  private readonly memoryStore: MemoryStore;
  private readonly memoryDistiller: MemoryDistiller;
  private readonly memoryBootstrap: MemoryBootstrap;

  constructor(memoryStore: MemoryStore, memoryDistiller: MemoryDistiller, memoryBootstrap: MemoryBootstrap) {
    this.memoryStore = memoryStore;
    this.memoryDistiller = memoryDistiller;
    this.memoryBootstrap = memoryBootstrap;
  }

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

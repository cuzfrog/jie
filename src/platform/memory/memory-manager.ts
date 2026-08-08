import type { Memory, MemoryStore, RawMemory } from "./memory-store";
import type { MemoryWriter } from "./memory-writer";
import type { MemoryBootstrap } from "./memory-bootstrap";
import type { MemoryDistiller, DistillationInput } from "./memory-distiller";

export interface MemoryManager {
  add(memories: ReadonlyArray<RawMemory>, teamId: string, sourceSessionId: string): number;
  search(query: string, teamId: string, limit: number): ReadonlyArray<Memory>;
  bootstrap(teamId: string): string;
  distill(input: DistillationInput): Promise<void>;
}

export class MemoryManagerImpl implements MemoryManager {
  private readonly memoryWriter: MemoryWriter;
  private readonly memoryStore: MemoryStore;
  private readonly memoryDistiller: MemoryDistiller;
  private readonly memoryBootstrap: MemoryBootstrap;

  constructor(memoryWriter: MemoryWriter, memoryStore: MemoryStore, memoryDistiller: MemoryDistiller, memoryBootstrap: MemoryBootstrap) {
    this.memoryWriter = memoryWriter;
    this.memoryStore = memoryStore;
    this.memoryDistiller = memoryDistiller;
    this.memoryBootstrap = memoryBootstrap;
  }

  add(memories: ReadonlyArray<RawMemory>, teamId: string, sourceSessionId: string): number {
    return this.memoryWriter.write(memories, teamId, sourceSessionId);
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

import type { MemoryStore, MemoryType, RawMemory } from "./memory-store";

export interface MemoryWriter {
  write(memories: ReadonlyArray<RawMemory>, teamId: string, sourceSessionId: string): number;
}

export class MemoryWriterImpl implements MemoryWriter {
  private readonly memoryStore: MemoryStore;

  constructor(memoryStore: MemoryStore) {
    this.memoryStore = memoryStore;
  }

  write(memories: ReadonlyArray<RawMemory>, teamId: string, sourceSessionId: string): number {
    for (const memory of memories) {
      if (memory.content.trim() === "") throw new Error("memory content must not be empty");
      if (memory.scene.trim() === "") throw new Error("memory scene must not be empty");
      if (!isMemoryType(memory.type)) throw new Error(`invalid memory type: ${memory.type}`);
      if (typeof memory.priority !== "number" || !Number.isFinite(memory.priority)) throw new Error("memory priority must be a finite number");
    }
    return this.memoryStore.add(memories, teamId, sourceSessionId);
  }
}

function isMemoryType(value: unknown): value is MemoryType {
  return value === "fact" || value === "decision" || value === "method" || value === "instruction";
}

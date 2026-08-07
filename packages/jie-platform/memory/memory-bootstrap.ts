import { logger } from "@cuzfrog/jie-utils";
import type { SettingsStore } from "../config";
import type { Memory, MemoryStore } from "./memory-store";

const log = logger.getSubLogger({ name: "jie.platform.memory" });

const DEFAULT_BOOTSTRAP_MAX_ENTRIES = 12;
const DEFAULT_BOOTSTRAP_MAX_CHARS = 2000;

export interface MemoryBootstrap {
  render(teamId: string): string;
}

export class MemoryBootstrapImpl implements MemoryBootstrap {
  private readonly memoryStore: MemoryStore;
  private readonly settingsStore: SettingsStore;

  constructor(memoryStore: MemoryStore, settingsStore: SettingsStore) {
    this.memoryStore = memoryStore;
    this.settingsStore = settingsStore;
  }

  render(teamId: string): string {
    try {
      const settings = this.settingsStore.load();
      if (settings.memory?.enabled === false) return "";
      const maxEntries = settings.memory?.bootstrapMaxEntries ?? DEFAULT_BOOTSTRAP_MAX_ENTRIES;
      const maxChars = settings.memory?.bootstrapMaxChars ?? DEFAULT_BOOTSTRAP_MAX_CHARS;
      const memories = this.memoryStore.top(teamId, maxEntries);
      return formatMemoryBootstrap(memories, teamId, maxChars);
    } catch (error) {
      log.warn(`memory bootstrap load failed: ${error instanceof Error ? error.message : String(error)}`);
      return "";
    }
  }
}

function formatMemoryBootstrap(memories: ReadonlyArray<Memory>, teamId: string, maxChars: number): string {
  const header = `<memory team="${teamId}">`;
  const footer = "</memory>";
  const lines: string[] = [];
  let used = header.length + footer.length + 1;
  for (const memory of memories) {
    const line = memoryBootstrapLine(memory);
    const cost = line.length + 1;
    if (used + cost > maxChars) break;
    lines.push(line);
    used += cost;
  }
  if (lines.length === 0) return "";
  return `${header}\n${lines.join("\n")}\n${footer}`;
}

function memoryBootstrapLine(memory: Memory): string {
  const sceneSuffix = memory.scene === "" || memory.type === "instruction" ? "" : ` (scene: ${memory.scene})`;
  return `- [${memory.type}] ${memory.content}${sceneSuffix}`;
}

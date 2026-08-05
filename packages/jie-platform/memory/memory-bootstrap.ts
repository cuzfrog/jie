import { logger } from "@cuzfrog/jie-utils";
import type { SettingsStore } from "../config";
import type { MemoryAtom, MemoryStore } from "./memory-store";

const log = logger.getSubLogger({ name: "jie.platform.memory" });

const BOOTSTRAP_TIMEOUT_MS = 5000;
const DEFAULT_BOOTSTRAP_MAX_ENTRIES = 12;
const DEFAULT_BOOTSTRAP_MAX_CHARS = 2000;

export async function loadMemoryBootstrap(memoryStore: MemoryStore, settingsStore: SettingsStore, teamId: string): Promise<string> {
  try {
    const settings = settingsStore.load();
    if (settings.memory?.enabled === false) return "";
    const maxEntries = settings.memory?.bootstrapMaxEntries ?? DEFAULT_BOOTSTRAP_MAX_ENTRIES;
    const maxChars = settings.memory?.bootstrapMaxChars ?? DEFAULT_BOOTSTRAP_MAX_CHARS;
    const atoms = await withTimeout(memoryStore.top(teamId, maxEntries), BOOTSTRAP_TIMEOUT_MS);
    return formatMemoryBootstrap(atoms, teamId, maxChars);
  } catch (error) {
    log.warn(`memory bootstrap load failed: ${error instanceof Error ? error.message : String(error)}`);
    return "";
  }
}

export function formatMemoryBootstrap(atoms: ReadonlyArray<MemoryAtom>, teamId: string, maxChars: number): string {
  const header = `<memory team="${teamId}">`;
  const footer = "</memory>";
  const lines: string[] = [];
  let used = header.length + footer.length + 1;
  for (const atom of atoms) {
    const line = atomBootstrapLine(atom);
    const cost = line.length + 1;
    if (used + cost > maxChars) break;
    lines.push(line);
    used += cost;
  }
  if (lines.length === 0) return "";
  return `${header}\n${lines.join("\n")}\n${footer}`;
}

function atomBootstrapLine(atom: MemoryAtom): string {
  const sceneSuffix = atom.scene === "" || atom.type === "instruction" ? "" : ` (scene: ${atom.scene})`;
  return `- [${atom.type}] ${atom.content}${sceneSuffix}`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("memory bootstrap timed out")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
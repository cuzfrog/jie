import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface PromptHistoryStore {
  load(): ReadonlyArray<string>;
  append(prompt: string): void;
}

const MAX_STORED_ENTRIES = 500;

export function createPromptHistoryStore(filePath: string): PromptHistoryStore {
  return {
    load(): ReadonlyArray<string> {
      const raw = readFileOrEmpty(filePath);
      if (raw === "") return [];
      const prompts = raw.split("\n").map(parsePromptLine).filter((prompt): prompt is string => prompt !== null);
      if (prompts.length <= MAX_STORED_ENTRIES) return prompts;
      const kept = prompts.slice(prompts.length - MAX_STORED_ENTRIES);
      writeFileSync(filePath, toLines(kept));
      return kept;
    },
    append(prompt: string): void {
      mkdirSync(dirname(filePath), { recursive: true });
      appendFileSync(filePath, `${JSON.stringify({ prompt })}\n`);
    },
  };
}

function toLines(prompts: ReadonlyArray<string>): string {
  return prompts.map((prompt) => JSON.stringify({ prompt })).join("\n") + "\n";
}

function readFileOrEmpty(filePath: string): string {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function parsePromptLine(line: string): string | null {
  if (line === "") return null;
  try {
    const parsed: HistoryLine = JSON.parse(line);
    if (typeof parsed.prompt !== "string" || parsed.prompt === "") return null;
    return parsed.prompt;
  } catch {
    return null;
  }
}

interface HistoryLine {
  readonly prompt?: string;
}

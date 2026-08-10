import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface PromptHistoryStore {
  load(): ReadonlyArray<string>;
  append(prompt: string): void;
}

const MAX_STORED_ENTRIES = 500;
const PROMPT_HISTORY_FILE = "prompt-history.jsonl";

export class PromptHistoryStoreImpl implements PromptHistoryStore {
  private readonly filePath: string;

  constructor(homeJieDir: string) {
    this.filePath = join(homeJieDir, PROMPT_HISTORY_FILE);
  }

  load(): ReadonlyArray<string> {
    const raw = readFileOrEmpty(this.filePath);
    if (raw === "") return [];
    const prompts = raw.split("\n").map(parsePromptLine).filter((prompt): prompt is string => prompt !== null);
    if (prompts.length <= MAX_STORED_ENTRIES) return prompts;
    const kept = prompts.slice(prompts.length - MAX_STORED_ENTRIES);
    writeFileSync(this.filePath, toLines(kept));
    return kept;
  }

  append(prompt: string): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    appendFileSync(this.filePath, `${JSON.stringify({ prompt })}\n`);
  }
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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { isErrnoException } from "../";
import { JiePlatformError } from "../jie-platform-errors";

interface RawProviderConfig {
  readonly baseUrl?: string;
  readonly api?: string;
  readonly apiKey?: string;
  readonly headers?: Record<string, string>;
  readonly models?: ReadonlyArray<RawModelConfig>;
}

interface RawCostConfig {
  readonly input?: number;
  readonly output?: number;
  readonly cacheRead?: number;
  readonly cacheWrite?: number;
}

interface RawModelConfig {
  readonly id: string;
  readonly name: string;
  readonly api?: string;
  readonly baseUrl?: string;
  readonly reasoning?: boolean;
  readonly input?: ReadonlyArray<"text" | "image">;
  readonly contextWindow?: number;
  readonly maxTokens?: number;
  readonly cost?: RawCostConfig;
  readonly compat?: Record<string, unknown>;
}

interface RawModelsConfig {
  readonly providers?: Record<string, RawProviderConfig>;
}

const API_BY_ID: Readonly<Record<string, Api>> = {
  "openai-completions": "openai-completions",
  "openai-responses": "openai-responses",
  "anthropic-messages": "anthropic-messages",
  "google-generative-ai": "google-generative-ai",
  "azure-openai-responses": "azure-openai-responses",
  "openai-codex-responses": "openai-codex-responses",
  "bedrock-converse-stream": "bedrock-converse-stream",
  "google-vertex": "google-vertex",
  "mistral-conversations": "mistral-conversations",
};

export interface ProjectModelInput {
  readonly id: string;
  readonly name: string;
  readonly api: Api | undefined;
  readonly baseUrl: string | undefined;
  readonly reasoning: boolean;
  readonly input: Array<"text" | "image">;
  readonly contextWindow: number;
  readonly maxTokens: number;
  readonly cost: Model<Api>["cost"];
  readonly compat: Model<Api>["compat"] | undefined;
}

export interface ProjectProviderInput {
  readonly baseUrl: string;
  readonly api: Api | undefined;
  readonly apiKey: string;
  readonly headers: Record<string, string>;
  readonly models: Array<ProjectModelInput> | undefined;
}

function resolveValue(value: string): string {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g, (_, braced: string | undefined, plain: string | undefined) => {
    const name = braced ?? plain ?? "";
    const env = process.env[name];
    return env ?? "";
  });
}

export function loadProjectProviderInputs(projectJieDir: string | null): Record<string, ProjectProviderInput> {
  if (projectJieDir === null) return {};
  const path = join(projectJieDir, "models.json");
  const raw = readModelsFile(path);
  if (raw === null || raw.providers === undefined) return {};

  const result: Record<string, ProjectProviderInput> = {};
  for (const [id, cfg] of Object.entries(raw.providers)) {
    if (cfg.baseUrl === undefined || cfg.baseUrl === "") {
      throw new JiePlatformError("INVALID_CONFIG", { detail: `models.json: provider '${id}': baseUrl is required` });
    }
    let api: Api | undefined;
    if (cfg.api !== undefined && cfg.api !== "") {
      api = API_BY_ID[cfg.api];
      if (api === undefined) {
        throw new JiePlatformError("INVALID_CONFIG", { detail: `models.json: provider '${id}': unknown api '${cfg.api}'` });
      }
    }
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(cfg.headers ?? {})) {
      headers[key] = resolveValue(value);
    }
    const models = cfg.models?.map((raw) => ({
      id: raw.id,
      name: raw.name ?? raw.id,
      api: raw.api === undefined || raw.api === "" ? undefined : API_BY_ID[raw.api],
      baseUrl: raw.baseUrl === undefined ? undefined : resolveValue(raw.baseUrl),
      reasoning: raw.reasoning ?? false,
      input: raw.input === undefined ? ["text" as const] : [...raw.input],
      contextWindow: raw.contextWindow ?? 128000,
      maxTokens: raw.maxTokens ?? 16384,
      cost: {
        input: raw.cost?.input ?? 0,
        output: raw.cost?.output ?? 0,
        cacheRead: raw.cost?.cacheRead ?? 0,
        cacheWrite: raw.cost?.cacheWrite ?? 0,
      },
      compat: Object.keys(raw.compat ?? {}).length > 0 ? raw.compat : undefined,
    }));
    result[id] = {
      baseUrl: resolveValue(cfg.baseUrl),
      api,
      apiKey: resolveValue(cfg.apiKey ?? ""),
      headers,
      models,
    };
  }
  return result;
}

function readModelsFile(path: string): RawModelsConfig | null {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") return null;
    const message = error instanceof Error ? error.message : String(error);
    throw new JiePlatformError("INVALID_CONFIG", {
      detail: `models.json at ${path}: ${message}`,
      cause: error instanceof Error ? error : new Error(message),
    });
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new JiePlatformError("INVALID_CONFIG", { detail: `models.json at ${path}: expected a JSON object` });
    }
    return parsed as RawModelsConfig;
  } catch (error) {
    if (error instanceof JiePlatformError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new JiePlatformError("INVALID_CONFIG", {
      detail: `models.json at ${path}: ${message}`,
      cause: error instanceof Error ? error : new Error(message),
    });
  }
}

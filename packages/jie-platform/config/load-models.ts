import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getModels as piGetModels } from "@earendil-works/pi-ai";
import type { Api, Model, OpenAICompletionsCompat, OpenAIResponsesCompat, AnthropicMessagesCompat } from "@earendil-works/pi-ai";

export interface RawModelsConfig {
  providers?: Record<string, RawProviderConfig>;
}

export interface RawProviderConfig {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  authHeader?: boolean;
  compat?: Record<string, unknown>;
  models?: RawModelConfig[];
  modelOverrides?: Record<string, RawModelOverride>;
}

export interface RawModelConfig {
  id: string;
  name?: string;
  api?: string;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  contextWindow?: number;
  maxTokens?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  compat?: Record<string, unknown>;
}

export interface RawModelOverride {
  name?: string;
  reasoning?: boolean;
  input?: ("text" | "image")[];
  contextWindow?: number;
  maxTokens?: number;
  compat?: Record<string, unknown>;
  headers?: Record<string, string>;
  cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number };
}

export interface ResolvedProviderConfig {
  provider: string;
  baseUrl: string;
  api: Api;
  apiKey: string;
  headers: Record<string, string>;
  authHeader: boolean;
  compat: OpenAICompletionsCompat | OpenAIResponsesCompat | AnthropicMessagesCompat | Record<string, never>;
}

export interface ResolvedModelsConfig {
  providers: Map<string, ResolvedProviderConfig>;
  models: Model<Api>[];
}

const KNOWN_APIS: ReadonlySet<Api> = new Set<Api>([
  "openai-completions",
  "openai-responses",
  "anthropic-messages",
  "google-generative-ai",
  "azure-openai-responses",
  "openai-codex-responses",
  "bedrock-converse-stream",
  "google-vertex",
  "mistral-conversations",
]);

export function loadModelsConfig(homeJieDir: string, projectJieDir: string | null): ResolvedModelsConfig {
  const projectPath = projectJieDir === null ? null : join(projectJieDir, "models.json");
  const globalPath = join(homeJieDir, "models.json");

  const globalRaw = readModelsFile(globalPath);
  const projectRaw = projectPath === null ? null : readModelsFile(projectPath);

  const merged: RawModelsConfig = mergeRawConfigs(globalRaw, projectRaw);
  return resolveConfig(merged);
}

function readModelsFile(path: string): RawModelsConfig | null {
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`models.json at ${path}: ${(e as Error).message}`);
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("expected a JSON object");
    }
    return parsed as RawModelsConfig;
  } catch (e) {
    throw new Error(`models.json at ${path}: ${(e as Error).message}`);
  }
}

function mergeRawConfigs(globalRaw: RawModelsConfig | null, projectRaw: RawModelsConfig | null): RawModelsConfig {
  const providers: Record<string, RawProviderConfig> = {};
  if (globalRaw?.providers !== undefined) {
    for (const [id, cfg] of Object.entries(globalRaw.providers)) {
      providers[id] = cfg;
    }
  }
  if (projectRaw?.providers !== undefined) {
    for (const [id, cfg] of Object.entries(projectRaw.providers)) {
      providers[id] = mergeProviderConfig(providers[id], cfg);
    }
  }
  return Object.keys(providers).length === 0 ? {} : { providers };
}

function mergeProviderConfig(base: RawProviderConfig | undefined, override: RawProviderConfig): RawProviderConfig {
  if (base === undefined) return { ...override };
  return {
    baseUrl: override.baseUrl ?? base.baseUrl,
    api: override.api ?? base.api,
    apiKey: override.apiKey ?? base.apiKey,
    headers: { ...(base.headers ?? {}), ...(override.headers ?? {}) },
    authHeader: override.authHeader ?? base.authHeader,
    compat: { ...(base.compat ?? {}), ...(override.compat ?? {}) },
    models: mergeModelArrays(base.models, override.models),
    modelOverrides: { ...(base.modelOverrides ?? {}), ...(override.modelOverrides ?? {}) },
  };
}

function mergeModelArrays(base: RawModelConfig[] | undefined, override: RawModelConfig[] | undefined): RawModelConfig[] | undefined {
  if (base === undefined && override === undefined) return undefined;
  const result = new Map<string, RawModelConfig>();
  for (const m of base ?? []) result.set(m.id, m);
  for (const m of override ?? []) result.set(m.id, m);
  return Array.from(result.values());
}

function resolveConfig(raw: RawModelsConfig): ResolvedModelsConfig {
  const providers = new Map<string, ResolvedProviderConfig>();
  const models: Model<Api>[] = [];
  if (raw.providers === undefined) return { providers, models };

  for (const [providerId, rawCfg] of Object.entries(raw.providers)) {
    if (typeof rawCfg.baseUrl !== "string" || rawCfg.baseUrl === "") {
      throw new Error(`models.json: provider '${providerId}': baseUrl is required`);
    }
    const api = resolveApi(providerId, rawCfg.api);
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawCfg.headers ?? {})) {
      headers[k] = resolveValue(v, `provider '${providerId}' headers.${k}`);
    }
    const compat = (rawCfg.compat ?? {}) as ResolvedProviderConfig["compat"];
    const apiKey = resolveValue(rawCfg.apiKey ?? "", `provider '${providerId}' apiKey`);
    const authHeader = rawCfg.authHeader ?? true;

    providers.set(providerId, {
      provider: providerId,
      baseUrl: rawCfg.baseUrl,
      api,
      apiKey,
      headers,
      authHeader,
      compat,
    });

    if (rawCfg.models !== undefined) {
      for (const rawM of rawCfg.models) {
        const model = buildModel(providerId, api, rawCfg.baseUrl, rawM, compat, headers, authHeader);
        models.push(model);
      }
    }
  }
  return { providers, models };
}

function resolveApi(providerId: string, declared: string | undefined): Api {
  if (declared !== undefined && declared !== "") {
    if (!KNOWN_APIS.has(declared as Api)) {
      throw new Error(`models.json: provider '${providerId}': unknown api '${declared}'`);
    }
    return declared as Api;
  }

  const builtinProbe = (piGetModels as (p: string) => Array<{ api: Api }> | undefined)(
    providerId as Parameters<typeof piGetModels>[0],
  );
  if (builtinProbe !== undefined && builtinProbe.length > 0 && builtinProbe[0] !== undefined) {
    return builtinProbe[0].api;
  }
  throw new Error(`models.json: provider '${providerId}': api is required for new providers`);
}

function buildModel(
  providerId: string,
  api: Api,
  baseUrl: string,
  raw: RawModelConfig,
  providerCompat: ResolvedProviderConfig["compat"],
  providerHeaders: Record<string, string>,
  authHeader: boolean,
): Model<Api> {
  if (typeof raw.id !== "string" || raw.id === "") {
    throw new Error(`models.json: provider '${providerId}': model.id is required`);
  }
  const mergedCompat = { ...providerCompat, ...(raw.compat ?? {}) } as ResolvedProviderConfig["compat"];
  const cost = {
    input: raw.cost?.input ?? 0,
    output: raw.cost?.output ?? 0,
    cacheRead: raw.cost?.cacheRead ?? 0,
    cacheWrite: raw.cost?.cacheWrite ?? 0,
  };
  const result: Model<Api> = {
    id: raw.id,
    name: raw.name ?? raw.id,
    api,
    provider: providerId,
    baseUrl,
    reasoning: raw.reasoning ?? false,
    input: raw.input ?? ["text"],
    cost,
    contextWindow: raw.contextWindow ?? 128000,
    maxTokens: raw.maxTokens ?? 16384,
  };
  if (Object.keys(providerHeaders).length > 0) result.headers = providerHeaders;
  if (Object.keys(mergedCompat).length > 0) result.compat = mergedCompat as never;
  if (authHeader === false) (result as unknown as { __authHeader?: boolean }).__authHeader = false;
  return result;
}

export function resolveValue(value: string, _path: string): string {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g, (_, braced: string | undefined, plain: string | undefined) => {
    const name = braced ?? plain ?? "";
    const env = process.env[name];
    return env ?? "";
  });
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isErrnoException } from "../";
import { JiePlatformError } from "../jie-platform-errors";
import type { ProviderConfigInput } from "@earendil-works/pi-coding-agent/dist/core/provider-composer";

interface RawProviderConfig {
  readonly baseUrl?: string;
  readonly api?: string;
  readonly apiKey?: string;
  readonly headers?: Record<string, string>;
}

interface RawModelsConfig {
  readonly providers?: Record<string, RawProviderConfig>;
}

const KNOWN_APIS = new Set<string>([
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

function resolveValue(value: string, _path: string): string {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}|\$([A-Z_][A-Z0-9_]*)/g, (_, braced: string | undefined, plain: string | undefined) => {
    const name = braced ?? plain ?? "";
    const env = process.env[name];
    return env ?? "";
  });
}

export function loadProjectProviderInputs(projectJieDir: string | null): Record<string, ProviderConfigInput> {
  if (projectJieDir === null) return {};
  const path = join(projectJieDir, "models.json");
  const raw = readModelsFile(path);
  if (raw === null || raw.providers === undefined) return {};

  const result: Record<string, ProviderConfigInput> = {};
  for (const [id, cfg] of Object.entries(raw.providers)) {
    if (cfg.baseUrl === undefined) {
      throw new JiePlatformError("INVALID_CONFIG", { detail: `models.json: provider '${id}': baseUrl is required` });
    }
    const baseUrl = resolveValue(cfg.baseUrl, `provider '${id}' baseUrl`);
    const apiKey = resolveValue(cfg.apiKey ?? "", `provider '${id}' apiKey`);
    const api = cfg.api;
    if (api !== undefined && !KNOWN_APIS.has(api)) {
      throw new JiePlatformError("INVALID_CONFIG", { detail: `models.json: provider '${id}': unknown api '${api}'` });
    }

    const headers: Record<string, string> = {};
    if (cfg.headers !== undefined) {
      for (const [k, v] of Object.entries(cfg.headers)) {
        headers[k] = resolveValue(v, `provider '${id}' headers.${k}`);
      }
    }

    result[id] = {
      baseUrl,
      api,
      apiKey,
      headers,
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

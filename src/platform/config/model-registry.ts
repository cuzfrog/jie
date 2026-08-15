import type { Api, ApiKeyAuth, AuthResult, Model, MutableModels, Provider, ProviderStreams } from "@earendil-works/pi-ai";
import { createProvider, defaultProviderAuthContext } from "@earendil-works/pi-ai";
import { builtinModels, builtinProviders, getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";
import {
  anthropicMessagesApi,
  azureOpenAIResponsesApi,
  bedrockConverseStreamApi,
  findEnvKeys,
  googleGenerativeAIApi,
  googleVertexApi,
  mistralConversationsApi,
  openAICodexResponsesApi,
  openAICompletionsApi,
  openAIResponsesApi,
} from "@earendil-works/pi-ai/compat";
import { builtinModelFor, builtinModelsFor, isBuiltinProvider, loadModelsConfig, type ResolvedModelsConfig, type ResolvedProviderConfig } from "./load-models";
import type { AuthStore } from "./auth-store";
import { JiePlatformError } from "../jie-platform-errors";

export interface ProviderInfo {
  readonly id: string;
  readonly configured: boolean;
  readonly envKeys: ReadonlyArray<string>;
}

export interface ModelRegistry {
  providers(): ReadonlyArray<string>;
  listProviders(): ReadonlyArray<ProviderInfo>;
  resolve(provider: string, modelId: string): Model<Api> | undefined;
  listModels(provider: string): ReadonlyArray<Model<Api>>;
  getAuth(provider: string): Promise<AuthResult | undefined>;
  reload(): void;
}

export class PiModelRegistry implements ModelRegistry {
  private custom: ResolvedModelsConfig;
  private readonly models: MutableModels;
  private readonly builtinById: ReadonlyMap<string, Provider>;
  private composedIds: ReadonlySet<string> = new Set();

  constructor(
    private readonly homeJieDir: string,
    private readonly projectJieDir: string | null,
    authStore: AuthStore,
  ) {
    this.custom = loadModelsConfig(homeJieDir, projectJieDir);
    this.builtinById = new Map(builtinProviders().map((provider) => [provider.id, provider]));
    this.models = builtinModels({ credentials: authStore, authContext: defaultProviderAuthContext() });
    this.applyCustomProviders();
  }

  reload(): void {
    this.custom = loadModelsConfig(this.homeJieDir, this.projectJieDir);
    this.applyCustomProviders();
  }

  providers(): string[] {
    const customIds = Array.from(this.custom.providers.keys());
    const builtinIds = getBuiltinProviders().filter((id) => !this.custom.providers.has(id));
    return [...customIds, ...builtinIds];
  }

  listProviders(): ProviderInfo[] {
    return this.providers().map((id) => ({ id, configured: this.custom.providers.has(id), envKeys: findEnvKeys(id) ?? [] }));
  }

  resolve(provider: string, modelId: string): Model<Api> | undefined {
    const customProvider = this.custom.providers.get(provider);
    if (isBuiltinProvider(provider)) {
      const builtinModel = builtinModelFor(provider, modelId);
      if (builtinModel === undefined) return undefined;
      return applyProviderConfig(builtinModel, customProvider);
    }
    const fromCustom = this.custom.models.find((m) => m.provider === provider && m.id === modelId);
    if (fromCustom !== undefined) return applyProviderConfig(fromCustom, customProvider);
    return undefined;
  }

  listModels(provider: string): Model<Api>[] {
    const customProvider = this.custom.providers.get(provider);
    if (!isBuiltinProvider(provider)) {
      if (customProvider !== undefined) {
        return this.custom.models.filter((m) => m.provider === provider);
      }
      return [];
    }
    const builtinModels = builtinModelsFor(provider);
    if (customProvider === undefined) return builtinModels;
    return builtinModels.map((m) => applyProviderConfig(m, customProvider));
  }

  getAuth(provider: string): Promise<AuthResult | undefined> {
    return this.models.getAuth(provider);
  }

  private applyCustomProviders(): void {
    for (const id of this.composedIds) {
      const builtin = this.builtinById.get(id);
      if (builtin !== undefined) this.models.setProvider(builtin);
      else this.models.deleteProvider(id);
    }
    const composed = new Set<string>();
    for (const [id, cfg] of this.custom.providers) {
      const builtin = this.builtinById.get(id);
      this.models.setProvider(builtin !== undefined ? withConfiguredApiKey(builtin, cfg) : customProvider(id, cfg));
      composed.add(id);
    }
    this.composedIds = composed;
  }
}

function applyProviderConfig(model: Model<Api>, cfg: ResolvedProviderConfig | undefined): Model<Api> {
  if (cfg === undefined) return model;
  const merged: Model<Api> = { ...model, baseUrl: cfg.baseUrl };
  if (Object.keys(cfg.headers).length > 0 || model.headers !== undefined) {
    merged.headers = { ...(model.headers ?? {}), ...cfg.headers };
  }
  if (Object.keys(cfg.compat).length > 0) {
    const mergedCompat = { ...(model.compat ?? {}), ...cfg.compat };
    merged.compat = mergedCompat;
  }
  return merged;
}

function withConfiguredApiKey(builtin: Provider, cfg: ResolvedProviderConfig): Provider {
  return { ...builtin, auth: { ...builtin.auth, apiKey: configuredApiKeyAuth(builtin.auth.apiKey, cfg.apiKey) } };
}

function customProvider(id: string, cfg: ResolvedProviderConfig): Provider {
  return createProvider({
    id,
    baseUrl: cfg.baseUrl,
    auth: { apiKey: configuredApiKeyAuth(undefined, cfg.apiKey) },
    models: [],
    api: customProviderStreams(cfg.api),
  });
}

function configuredApiKeyAuth(builtin: ApiKeyAuth | undefined, configuredKey: string): ApiKeyAuth {
  return {
    name: builtin?.name ?? "API key",
    login: builtin?.login,
    check: async (input) => {
      if (input.credential?.key !== undefined) return { type: "api_key", source: "stored credential" };
      if (configuredKey !== "") return { type: "api_key", source: "configured API key" };
      return builtin?.check?.(input);
    },
    resolve: async (input) => {
      if (input.credential?.key !== undefined) {
        return { auth: { apiKey: input.credential.key }, env: input.credential.env, source: "stored credential" };
      }
      if (configuredKey !== "") return { auth: { apiKey: configuredKey }, source: "configured API key" };
      return builtin?.resolve(input);
    },
  };
}

const STREAM_FACTORIES: ReadonlyMap<string, () => ProviderStreams> = new Map<string, () => ProviderStreams>([
  ["openai-completions", openAICompletionsApi],
  ["openai-responses", openAIResponsesApi],
  ["anthropic-messages", anthropicMessagesApi],
  ["google-generative-ai", googleGenerativeAIApi],
  ["azure-openai-responses", azureOpenAIResponsesApi],
  ["openai-codex-responses", openAICodexResponsesApi],
  ["bedrock-converse-stream", bedrockConverseStreamApi],
  ["google-vertex", googleVertexApi],
  ["mistral-conversations", mistralConversationsApi],
]);

function customProviderStreams(api: Api): ProviderStreams {
  const factory = STREAM_FACTORIES.get(api);
  if (factory === undefined) {
    throw new JiePlatformError("INVALID_CONFIG", { detail: `models.json: no stream implementation for api '${api}'` });
  }
  return factory();
}

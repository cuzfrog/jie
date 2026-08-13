import type { Api, Model } from "@earendil-works/pi-ai";
import { getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";
import { findEnvKeys } from "@earendil-works/pi-ai/compat";
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
  getApiKey(provider: string): string | undefined;
  reload(): void;
}

export class PiModelRegistry implements ModelRegistry {
  private custom: ResolvedModelsConfig;

  constructor(
    private readonly homeJieDir: string,
    private readonly projectJieDir: string | null,
    private readonly authStore: AuthStore,
  ) {
    this.custom = loadModelsConfig(homeJieDir, projectJieDir);
  }

  reload(): void {
    this.custom = loadModelsConfig(this.homeJieDir, this.projectJieDir);
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

  getApiKey(provider: string): string | undefined {
    const auth = this.authStore.load();
    const entry = auth[provider];
    if (entry !== undefined) {
      if (entry.type === "api_key") return entry.key;
      throw new JiePlatformError("OAUTH_NOT_SUPPORTED", {
        detail: `OAuth credentials for '${provider}' are not supported in v1; use 'jie login --api-key' or 'jie --api-key' instead`,
      });
    }
    const customProvider = this.custom.providers.get(provider);
    if (customProvider !== undefined) {
      return customProvider.apiKey === "" ? undefined : customProvider.apiKey;
    }
    return undefined;
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

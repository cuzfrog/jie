import type { Api, Model } from "@earendil-works/pi-ai";
import { getBuiltinModel, getBuiltinModels, getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";
import { loadModelsConfig, type ResolvedModelsConfig, type ResolvedProviderConfig } from "./load-models";
import type { AuthStore } from "./auth-store";
import { JiePlatformError } from "../jie-platform-errors";

export interface ModelRegistry {
  providers(): ReadonlyArray<string>;
  resolve(provider: string, modelId: string): Model<Api> | undefined;
  listModels(provider: string): ReadonlyArray<Model<Api>>;
  getApiKey(provider: string): string | undefined;
}

export function createModelRegistry(
  homeJieDir: string,
  projectJieDir: string | null,
  authStore: AuthStore,
): ModelRegistry {
  return new PiModelRegistry(loadModelsConfig(homeJieDir, projectJieDir), authStore);
}

class PiModelRegistry implements ModelRegistry {
  private readonly custom: ResolvedModelsConfig;
  private readonly authStore: AuthStore;

  constructor(custom: ResolvedModelsConfig, authStore: AuthStore) {
    this.custom = custom;
    this.authStore = authStore;
  }

  providers(): string[] {
    const customIds = Array.from(this.custom.providers.keys());
    const builtinIds = getBuiltinProviders().filter((id) => !this.custom.providers.has(id));
    return [...customIds, ...builtinIds];
  }

  resolve(provider: string, modelId: string): Model<Api> | undefined {
    const customProvider = this.custom.providers.get(provider);
    const isBuiltin = (getBuiltinProviders() as string[]).includes(provider);

    if (isBuiltin) {
      const builtinModel = getBuiltinModel(
        provider as Parameters<typeof getBuiltinModel>[0],
        modelId as Parameters<typeof getBuiltinModel>[1],
      );
      if (builtinModel === undefined) return undefined;
      return applyProviderConfig(builtinModel as unknown as Model<Api>, customProvider);
    }
    const fromCustom = this.custom.models.find((m) => m.provider === provider && m.id === modelId);
    if (fromCustom !== undefined) return applyProviderConfig(fromCustom, customProvider);
    return undefined;
  }

  listModels(provider: string): Model<Api>[] {
    const customProvider = this.custom.providers.get(provider);
    const isBuiltin = (getBuiltinProviders() as string[]).includes(provider);
    if (customProvider !== undefined && !isBuiltin) {
      return this.custom.models.filter((m) => m.provider === provider);
    }
    const builtinModels = getBuiltinModels(provider as Parameters<typeof getBuiltinModels>[0]);
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
    merged.compat = { ...((model.compat ?? {}) as Record<string, unknown>), ...cfg.compat } as never;
  }
  return merged;
}

import type { Model } from "@earendil-works/pi-ai";
import { getModel as piGetModel, getModels as piGetModels, getProviders as piGetProviders } from "@earendil-works/pi-ai";
import { loadModelsConfig, type ResolvedModelsConfig, type ResolvedProviderConfig } from "./load-models.ts";
import type { AuthStore } from "./auth-store.ts";
import { JiePlatformError } from "../domain-types.ts";

export interface ModelRegistry {
  providers(): string[];
  resolve(provider: string, modelId: string): Model<any> | undefined;
  listModels(provider: string): Model<any>[];
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
    const builtinIds = piGetProviders().filter((id) => !this.custom.providers.has(id));
    return [...customIds, ...builtinIds];
  }

  resolve(provider: string, modelId: string): Model<any> | undefined {
    const customProvider = this.custom.providers.get(provider);
    const isBuiltin = (piGetProviders() as string[]).includes(provider);

    if (isBuiltin) {
      const builtinModel = piGetModel(provider as Parameters<typeof piGetModel>[0], modelId as Parameters<typeof piGetModel>[1]);
      if (builtinModel === undefined) return undefined;
      return applyProviderConfig(builtinModel as unknown as Model<any>, customProvider);
    }
    const fromCustom = this.custom.models.find((m) => m.provider === provider && m.id === modelId);
    if (fromCustom !== undefined) return applyProviderConfig(fromCustom, customProvider);
    return undefined;
  }

  listModels(provider: string): Model<any>[] {
    const customProvider = this.custom.providers.get(provider);
    const isBuiltin = (piGetProviders() as string[]).includes(provider);
    if (customProvider !== undefined && !isBuiltin) {
      return this.custom.models.filter((m) => m.provider === provider);
    }
    const builtinModels = piGetModels(provider as Parameters<typeof piGetModels>[0]);
    if (customProvider === undefined) return builtinModels as unknown as Model<any>[];
    return builtinModels.map((m) => applyProviderConfig(m as unknown as Model<any>, customProvider));
  }

  getApiKey(provider: string): string | undefined {
    const auth = this.authStore.load();
    const entry = auth[provider];
    if (entry !== undefined) {
      if (entry.type === "api_key") return entry.key;
      throw new JiePlatformError(
        "oauth_not_supported",
        `OAuth credentials for '${provider}' are not supported in v1; use 'jie login --api-key' or 'jie --api-key' instead`,
      );
    }
    const customProvider = this.custom.providers.get(provider);
    if (customProvider !== undefined) {
      return customProvider.apiKey === "" ? undefined : customProvider.apiKey;
    }
    return undefined;
  }
}

function applyProviderConfig(model: Model<any>, cfg: ResolvedProviderConfig | undefined): Model<any> {
  if (cfg === undefined) return model;
  const merged: Model<any> = { ...model, baseUrl: cfg.baseUrl };
  if (Object.keys(cfg.headers).length > 0 || model.headers !== undefined) {
    merged.headers = { ...(model.headers ?? {}), ...cfg.headers };
  }
  if (Object.keys(cfg.compat).length > 0) {
    merged.compat = { ...((model.compat ?? {}) as Record<string, unknown>), ...cfg.compat } as never;
  }
  return merged;
}

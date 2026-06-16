import type { Model } from "@earendil-works/pi-ai";
import { getModel as piGetModel, getModels as piGetModels, getProviders as piGetProviders } from "@earendil-works/pi-ai";
import { loadModelsConfig, type ResolvedModelsConfig, type ResolvedProviderConfig } from "./load-models.ts";

/** In-memory model registry. Combines custom providers from
 *  `models.json` with the built-in providers from `@earendil-works/pi-ai`.
 *  Resolution order: custom first, then built-in. Built-in providers
 *  with a custom override (baseUrl/apiKey/headers/compat) get the
 *  override applied to the resolved `Model` instance. */
export class ModelRegistry {
  private readonly custom: ResolvedModelsConfig;

  constructor(custom: ResolvedModelsConfig) {
    this.custom = custom;
  }

  /** Build a registry by reading the project's `models.json` and the
   *  global one under `~/.jie/models.json`. Missing files yield an
   *  empty custom config; only built-in providers are available. */
  static load(cwd: string, options: { homeDir?: string } = {}): ModelRegistry {
    return new ModelRegistry(loadModelsConfig(cwd, options));
  }

  /** List all provider ids known to the registry: custom first,
   *  then built-in. Custom ids shadow built-in ids in the same order
   *  as `getModel`. */
  providers(): string[] {
    const customIds = Array.from(this.custom.providers.keys());
    const builtinIds = piGetProviders().filter((id) => !this.custom.providers.has(id));
    return [...customIds, ...builtinIds];
  }

  /** Look up a `Model` by provider and model id. Returns `undefined`
   *  if neither the custom nor the built-in registry has it. */
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

  /** List `Model` entries for a provider, applying any custom
   *  override. For built-in providers without an override, this
   *  delegates to `piGetModels`. For built-in providers WITH an
   *  override, this returns the built-in models with the override
   *  applied (and any custom `modelOverrides` or added `models`).
   *  For non-built-in providers, returns the provider's own
   *  `models` array. */
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

  /** Returns the api key for a provider, applying the custom config
   *  if present. For built-in providers without a custom override,
   *  returns `undefined` (let the auth.json flow take over). */
  getApiKey(provider: string): string | undefined {
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

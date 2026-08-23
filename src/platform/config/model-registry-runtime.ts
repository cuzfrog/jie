import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { findEnvKeys } from "@earendil-works/pi-ai/compat";
import type { Api, Model, AuthResult } from "@earendil-works/pi-ai";
import type { AuthStore } from "./auth-store";
import { loadProjectProviderInputs } from "./project-models";
import type { ModelRegistry, ProviderInfo } from "./model-registry";

export interface ModelRefreshResult {
  readonly refreshed: ReadonlyArray<string>;
  readonly errors: ReadonlyArray<string>;
}

export class ModelRuntimeModelRegistry implements ModelRegistry {
  private readonly runtime: ModelRuntime;

  constructor(runtime: ModelRuntime, private readonly homeJieDir: string, private readonly projectJieDir: string | null) {
    this.runtime = runtime;
  }

  static async create(homeJieDir: string, projectJieDir: string | null, authStore: AuthStore): Promise<ModelRuntimeModelRegistry> {
    const runtime = await ModelRuntime.create({
      credentials: authStore,
      modelsPath: join(homeJieDir, "models.json"),
      allowModelNetwork: false,
    });
    const registry = new ModelRuntimeModelRegistry(runtime, homeJieDir, projectJieDir);
    await registry.registerProjectProviders();
    return registry;
  }

  providers(): ReadonlyArray<string> {
    const ids = new Set<string>(this.runtime.getRegisteredProviderIds());
    return Array.from(ids);
  }

  listProviders(): ReadonlyArray<ProviderInfo> {
    return this.providers().map((id) => ({
      id,
      configured: this.runtime.hasConfiguredAuth(id),
      envKeys: findEnvKeys(id) ?? [],
    }));
  }

  resolve(provider: string, modelId: string): Model<Api> | undefined {
    return this.runtime.getModel(provider, modelId);
  }

  listModels(provider: string): ReadonlyArray<Model<Api>> {
    return this.runtime.getModels(provider);
  }

  getAuth(provider: string): Promise<AuthResult | undefined> {
    return this.runtime.getAuth(provider);
  }

  reload(): void {
    this.registerProjectProvidersSync();
  }

  refresh(force: boolean): Promise<{ readonly refreshed: ReadonlyArray<string>; readonly errors: ReadonlyArray<string> }> {
    const offline = process.env.PI_OFFLINE === "1" || process.env.JIE_OFFLINE === "1";
    const allowNetwork = force && !offline;
    return this.runtime.refresh({ allowNetwork, force }).then((result) => ({
      refreshed: result.refreshed,
      errors: Object.entries(result.errors).map(([provider, msg]) => `${provider}: ${msg}`),
    }));
  }

  private async registerProjectProviders(): Promise<void> {
    this.registerProjectProvidersSync();
  }

  private registerProjectProvidersSync(): void {
    const inputs = loadProjectProviderInputs(this.projectJieDir);
    for (const [id, cfg] of Object.entries(inputs)) {
      this.runtime.unregisterProvider(id);
      this.runtime.registerProvider(id, cfg);
    }
  }
}

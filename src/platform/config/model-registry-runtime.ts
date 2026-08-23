import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { findEnvKeys } from "@earendil-works/pi-ai/compat";
import type { Api, AuthResult, Model } from "@earendil-works/pi-ai";
import type { AuthStore } from "./auth-store";
import { loadProjectProviderInputs } from "./project-models";
import type { ModelRegistry, ProviderInfo } from "./model-registry";

export class ModelRuntimeModelRegistry implements ModelRegistry {
  private readonly runtime: ModelRuntime;

  constructor(runtime: ModelRuntime, private readonly projectJieDir: string | null) {
    this.runtime = runtime;
  }

  static async create(homeJieDir: string, projectJieDir: string | null, authStore: AuthStore): Promise<ModelRuntimeModelRegistry> {
    const runtime = await ModelRuntime.create({
      credentials: authStore,
      modelsPath: join(homeJieDir, "models.json"),
      allowModelNetwork: false,
    });
    const registry = new ModelRuntimeModelRegistry(runtime, projectJieDir);
    registry.registerProjectProviders();
    return registry;
  }

  providers(): ReadonlyArray<string> {
    return this.runtime.getProviders().map((provider) => provider.id);
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

  async reload(): Promise<void> {
    await this.runtime.refresh({ allowNetwork: false });
    this.registerProjectProviders();
  }

  async refresh(force: boolean): Promise<{ readonly errors: ReadonlyArray<string> }> {
    const offline = process.env.PI_OFFLINE === "1" || process.env.JIE_OFFLINE === "1";
    const result = await this.runtime.refresh({ allowNetwork: force && !offline, force });
    return { errors: Array.from(result.errors.entries()).map(([provider, error]) => `${provider}: ${error.message}`) };
  }

  private registerProjectProviders(): void {
    for (const [id, cfg] of Object.entries(loadProjectProviderInputs(this.projectJieDir))) {
      this.runtime.unregisterProvider(id);
      this.runtime.registerProvider(id, cfg);
    }
  }
}

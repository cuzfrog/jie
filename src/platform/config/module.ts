import { asClass, asValue, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { AuthStoreImpl } from "./auth-store";
import { ModelRuntimeModelRegistry } from "./model-registry-runtime";
import { SettingsStoreImpl } from "./settings-store";

export async function registerConfigModule(container: AwilixContainer<PlatformCradle>): Promise<void> {
  container.register({
    authStore: asClass(AuthStoreImpl).singleton(),
    settingsStore: asClass(SettingsStoreImpl).singleton(),
  });
  const registry = await ModelRuntimeModelRegistry.create(
    container.resolve("homeJieDir"),
    container.resolve("projectJieDir"),
    container.resolve("authStore"),
  );
  container.register({ modelRegistry: asValue(registry) });
}

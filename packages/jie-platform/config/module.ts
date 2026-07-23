import { asClass, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { AuthStoreImpl } from "./auth-store";
import { PiModelRegistry } from "./model-registry";
import { SettingsStoreImpl } from "./settings-store";

export function registerConfigModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    authStore: asClass(AuthStoreImpl).singleton(),
    modelRegistry: asClass(PiModelRegistry).singleton(),
    settingsStore: asClass(SettingsStoreImpl).singleton(),
  });
}

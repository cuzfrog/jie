import { asClass, asValue, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { AuthStoreImpl } from "./auth-store";
import { PiModelRegistry } from "./model-registry";
import { SettingsStoreImpl } from "./settings-store";

export function registerConfigModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    authStore: asClass(AuthStoreImpl).singleton(),
    modelRegistry: asClass(PiModelRegistry).singleton(),
    teamLocator: asValue((teamId: string) => container.cradle.teamManager.locate(teamId)),
    settingsStore: asClass(SettingsStoreImpl).singleton(),
  });
}

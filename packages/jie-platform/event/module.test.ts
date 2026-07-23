import { createContainer, InjectionMode } from "awilix";
import type { PlatformCradle } from "../container";
import { registerEventModule } from "./module";

describe("registerEventModule", () => {
  test("registers eventBus and eventManager", () => {
    const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
    registerEventModule(container);
    expect(container.hasRegistration("eventBus")).toBe(true);
    expect(container.hasRegistration("eventManager")).toBe(true);
  });

  test("registers singletons", () => {
    const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
    registerEventModule(container);
    expect(container.cradle.eventBus).toBe(container.resolve("eventBus"));
    expect(container.cradle.eventManager).toBe(container.resolve("eventManager"));
  });
});

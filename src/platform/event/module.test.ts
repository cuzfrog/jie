import { createContainer, InjectionMode } from "awilix";
import type { PlatformCradle } from "../container";
import { registerEventModule } from "./module";

describe("registerEventModule", () => {
  test("registers eventManager", () => {
    const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
    registerEventModule(container);
    expect(container.hasRegistration("eventManager")).toBe(true);
  });

  test("registers singleton", () => {
    const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
    registerEventModule(container);
    expect(container.cradle.eventManager).toBe(container.resolve("eventManager"));
  });
});

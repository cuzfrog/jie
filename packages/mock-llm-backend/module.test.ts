import { createContainer, InjectionMode } from "awilix";
import { registerMockServerModule, type MockServerCradle } from "./module.ts";

describe("registerMockServerModule", () => {
  test("registers expectationStore and mockLlmServer", () => {
    const container = createContainer<MockServerCradle>({ injectionMode: InjectionMode.CLASSIC });
    registerMockServerModule(container);
    expect(container.hasRegistration("expectationStore")).toBe(true);
    expect(container.hasRegistration("mockLlmServer")).toBe(true);
  });

  test("expectationStore resolves as a singleton", () => {
    const container = createContainer<MockServerCradle>({ injectionMode: InjectionMode.CLASSIC });
    registerMockServerModule(container);
    expect(container.resolve("expectationStore")).toBe(container.resolve("expectationStore"));
  });
});

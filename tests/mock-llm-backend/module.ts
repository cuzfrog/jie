import { asClass, type AwilixContainer } from "awilix";
import { ExpectationStoreImpl, type ExpectationStore } from "./expectation-store.ts";
import { MockLlmServerImpl, type MockLlmServer } from "./mock-llm-server.ts";

export interface MockServerCradle {
  readonly expectationStore: ExpectationStore;
  readonly mockLlmServer: MockLlmServer;
}

export function registerMockServerModule(container: AwilixContainer<MockServerCradle>): void {
  container.register({
    expectationStore: asClass(ExpectationStoreImpl).singleton(),
    mockLlmServer: asClass(MockLlmServerImpl).singleton(),
  });
}

import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import { type ChatMessages } from "../components/chat";
import { type StateStore } from "../state";
import { type TuiCradle } from "../container";
import { registerSyncModule } from "./module";

function bootContainer(): AwilixContainer<TuiCradle> {
  const container = createContainer<TuiCradle>({ injectionMode: InjectionMode.CLASSIC });
  const stateStore = vi.mocked<StateStore>({
    getState: vi.fn(),
    dispatch: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  });
  const chatMessages = vi.mocked<ChatMessages>({
    createUserMessage: vi.fn(),
    createAssistantMessage: vi.fn(),
  });
  container.register({
    stateStore: asValue(stateStore),
    chatMessages: asValue(chatMessages),
  });
  return container;
}

describe("registerSyncModule", () => {
  test("registers chatSyncFactory", () => {
    const container = bootContainer();
    registerSyncModule(container);
    expect(container.hasRegistration("chatSyncFactory")).toBe(true);
  });

  test("chatSyncFactory resolves as a singleton", () => {
    const container = bootContainer();
    registerSyncModule(container);
    expect(container.resolve("chatSyncFactory")).toBe(container.resolve("chatSyncFactory"));
  });
});

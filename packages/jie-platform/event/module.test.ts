import { createContainer, InjectionMode } from "awilix";
import type { PlatformCradle } from "../container";
import { Events, type EventEnvelope } from "./events";
import { registerEventModule } from "./module";

describe("registerEventModule", () => {
  test("resolves a wired eventManager that round-trips through the registered eventBus", () => {
    const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
    registerEventModule(container);
    const received: Array<EventEnvelope<"user.prompt">> = [];
    container.cradle.eventManager.subscribe("user.prompt", (event) => {
      received.push(event);
    });
    container.cradle.eventManager.publish(Events.userPrompt({ kind: "user" }, "t1", "hello", "general-1"));
    expect(received).toHaveLength(1);
    expect(received[0]!.payload.prompt).toBe("hello");
    expect(container.cradle.eventBus.subscriberCount("user.prompt")).toBe(1);
  });

  test("registers singletons", () => {
    const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
    registerEventModule(container);
    expect(container.cradle.eventManager).toBe(container.resolve("eventManager"));
    expect(container.cradle.eventBus).toBe(container.resolve("eventBus"));
  });
});

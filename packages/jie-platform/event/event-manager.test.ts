import type { EventBus } from "./event-bus";
import { EventManagerImpl, type EventManager } from "./event-manager";
import { Events, type EventEnvelope, type UserSender } from "./events";

const bus = vi.mocked<EventBus>({
  publish: vi.fn(),
  subscribe: vi.fn(),
});

const sender: UserSender = { kind: "user" };

describe("EventManagerImpl", () => {
  let manager: EventManager;

  beforeEach(() => {
    manager = new EventManagerImpl(bus);
  });

  test("publish forwards the envelope to the bus keyed by its topic", () => {
    const envelope = Events.userPrompt(sender, "t1", "hello", "general-1");
    manager.publish(envelope);
    expect(bus.publish).toHaveBeenCalledWith("user.prompt", envelope);
  });

  test("subscribe registers on the bus and the captured bus callback forwards the envelope", () => {
    const received: Array<EventEnvelope<"user.prompt">> = [];
    manager.subscribe("user.prompt", (event) => {
      received.push(event);
    });
    expect(bus.subscribe).toHaveBeenCalledTimes(1);
    const busCallback = bus.subscribe.mock.calls[0]![1]!;
    const envelope = Events.userPrompt(sender, "t1", "hello", "general-1");
    busCallback("user.prompt", envelope);
    expect(received).toEqual([envelope]);
  });

  test("subscribe returns the unsubscribe function provided by the bus", () => {
    const unsubscribe = vi.fn();
    bus.subscribe.mockReturnValue(unsubscribe);
    expect(manager.subscribe("user.prompt", () => {})).toBe(unsubscribe);
  });

  test("string-topic subscribe forwards the topic to the bus", () => {
    manager.subscribe("unknown.topic", () => {});
    expect(bus.subscribe).toHaveBeenCalledTimes(1);
    expect(bus.subscribe.mock.calls[0]![0]).toBe("unknown.topic");
  });
});

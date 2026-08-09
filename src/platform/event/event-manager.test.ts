import { InProcessEventManager, type EventManager } from "./event-manager";
import { Events, type AgentSender, type EventEnvelope, type UserSender } from "./events";

const agentSender: AgentSender = { kind: "agent", teamId: "t1", agentKey: "general-1" };
const userSender: UserSender = { kind: "user" };

function envelope(clientTopic: string, message = "msg"): EventEnvelope<`custom.${string}`> {
  return Events.custom(agentSender, clientTopic, message);
}

describe("InProcessEventManager", () => {
  let manager: EventManager;

  beforeEach(() => {
    manager = new InProcessEventManager();
  });

  test("publish delivers the envelope to subscribers in subscription order", () => {
    const received: Array<EventEnvelope<`custom.${string}`>> = [];
    manager.subscribe("custom.s", (event) => {
      received.push(event as EventEnvelope<`custom.${string}`>);
    });
    manager.subscribe("custom.s", (event) => {
      received.push(event as EventEnvelope<`custom.${string}`>);
    });
    const event = envelope("s");
    manager.publish(event);
    expect(received).toEqual([event, event]);
  });

  test("a throwing callback does not stop dispatch; subsequent subscribers still run", () => {
    let secondRan = false;
    manager.subscribe("custom.s", () => {
      throw new Error("boom");
    });
    manager.subscribe("custom.s", () => {
      secondRan = true;
    });

    expect(() => manager.publish(envelope("s"))).not.toThrow();
    expect(secondRan).toBe(true);
  });

  test("unsubscribe prevents the callback from firing on later publish", () => {
    let ran = false;
    const off = manager.subscribe("custom.s", () => {
      ran = true;
    });
    off();
    manager.publish(envelope("s"));
    expect(ran).toBe(false);
  });

  test("subscribers on different topics are isolated", () => {
    let aRan = false;
    let bRan = false;
    manager.subscribe("custom.a", () => {
      aRan = true;
    });
    manager.subscribe("custom.b", () => {
      bRan = true;
    });
    manager.publish(envelope("a"));
    expect(aRan).toBe(true);
    expect(bRan).toBe(false);
  });

  test("callback receives the published envelope by reference", () => {
    let seen: EventEnvelope<`custom.${string}`> | undefined;
    const event = envelope("s");
    manager.subscribe("custom.s", (event) => {
      seen = event as EventEnvelope<`custom.${string}`>;
    });
    manager.publish(event);
    expect(seen).toBe(event);
  });

  test("publish is depth-first synchronous: nested subscribers complete before outer publish returns", () => {
    const events: string[] = [];

    manager.subscribe("custom.wake", () => {
      events.push("A-enter");
      manager.publish(envelope("b-topic", "do work"));
      events.push("A-leave");
    });

    manager.subscribe("custom.b-topic", () => {
      events.push("B-received");
      manager.publish(Events.agentTurnStart(agentSender, "worker-1"));
      events.push("B-signaled-busy");
    });

    manager.subscribe("agent.turn.start", (event) => {
      const key = event.payload;
      events.push(`observer:${key}:turn_start`);
    });

    events.push("before-publish");
    manager.publish(envelope("wake", "wake up"));
    events.push("after-publish");

    expect(events).toEqual([
      "before-publish",
      "A-enter",
      "B-received",
      "observer:worker-1:turn_start",
      "B-signaled-busy",
      "A-leave",
      "after-publish",
    ]);
  });

  test("subscribe returns an unsubscribe function", () => {
    const off = manager.subscribe("custom.s", () => {});
    expect(typeof off).toBe("function");
    off();
    manager.publish(envelope("s"));
  });

  test("typed subscribe receives the correlated event type", () => {
    const received: Array<EventEnvelope<"user.prompt">> = [];
    manager.subscribe("user.prompt", (event) => {
      received.push(event);
    });
    const event = Events.userPrompt(userSender, "t1", "general-1", "hello");
    manager.publish(event);
    expect(received).toEqual([event]);
  });
});

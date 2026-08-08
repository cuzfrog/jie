import { InProcessEventBus } from "./event-bus";

describe("InProcessEventBus", () => {
  test("publishes to subscribers in subscription order with the same arguments", () => {
    const bus = new InProcessEventBus();
    const received: Array<[string, object]> = [];
    bus.subscribe("s", (subject, payload) => {
      received.push([subject, payload]);
    });
    bus.subscribe("s", (subject, payload) => {
      received.push([subject, payload]);
    });
    const payload = { x: 1 };
    bus.publish("s", payload);
    expect(received).toEqual([
      ["s", payload],
      ["s", payload],
    ]);
  });

  test("a throwing callback does not stop dispatch; subsequent subscribers still run", () => {
    const bus = new InProcessEventBus();
    let secondRan = false;
    bus.subscribe("s", () => {
      throw new Error("boom");
    });
    bus.subscribe("s", () => {
      secondRan = true;
    });

    expect(() => bus.publish("s", { x: 1 })).not.toThrow();
    expect(secondRan).toBe(true);
  });

  test("unsubscribe prevents the callback from firing on later publish", () => {
    const bus = new InProcessEventBus();
    let ran = false;
    const off = bus.subscribe("s", () => {
      ran = true;
    });
    off();
    bus.publish("s", { x: 1 });
    expect(ran).toBe(false);
  });

  test("subscribers on different subjects are isolated", () => {
    const bus = new InProcessEventBus();
    let aRan = false;
    let bRan = false;
    bus.subscribe("a", () => {
      aRan = true;
    });
    bus.subscribe("b", () => {
      bRan = true;
    });
    bus.publish("a", { x: 1 });
    expect(aRan).toBe(true);
    expect(bRan).toBe(false);
  });

  test("callback receives the published payload object by reference", () => {
    const bus = new InProcessEventBus();
    let seen: object | undefined;
    const payload = { inner: "value" };
    bus.subscribe("s", (_subject, p) => {
      seen = p;
    });
    bus.publish("s", payload);
    expect(seen).toBe(payload);
  });

  test("publish is depth-first synchronous: nested subscribers complete before outer publish returns", () => {
    const bus = new InProcessEventBus();
    const events: string[] = [];

    bus.subscribe("wake", () => {
      events.push("A-enter");
      bus.publish("B-topic", { msg: "do work" });
      events.push("A-leave");
    });

    bus.subscribe("B-topic", () => {
      events.push("B-received");
      bus.publish("agent.turn.start", { agentKey: "worker-1" });
      events.push("B-signaled-busy");
    });

    bus.subscribe("agent.turn.start", (_subject, p) => {
      const key = (p as { agentKey: string }).agentKey;
      events.push(`observer:${key}:turn_start`);
    });

    events.push("before-publish");
    bus.publish("wake", { instruction: "wake up" });
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
});

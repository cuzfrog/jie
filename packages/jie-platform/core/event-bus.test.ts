import { describe, expect, spyOn, test } from "bun:test";
import { InProcessEventBus } from "./in-process-event-bus.ts";

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
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    let secondRan = false;
    bus.subscribe("s", () => {
      throw new Error("boom");
    });
    bus.subscribe("s", () => {
      secondRan = true;
    });

    expect(() => bus.publish("s", { x: 1 })).not.toThrow();
    expect(secondRan).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
    const args = errorSpy.mock.calls[0]!;
    expect(args[0]).toContain("s");
    expect(args[0]).toContain("boom");
    expect(args[1]).toBeString();
    errorSpy.mockRestore();
  });

  test("subscriberCount reflects registers minus unsubscribes", () => {
    const bus = new InProcessEventBus();
    expect(bus.subscriberCount("s")).toBe(0);
    const off1 = bus.subscribe("s", () => {});
    const off2 = bus.subscribe("s", () => {});
    expect(bus.subscriberCount("s")).toBe(2);
    off1();
    expect(bus.subscriberCount("s")).toBe(1);
    off2();
    expect(bus.subscriberCount("s")).toBe(0);
    const off3 = bus.subscribe("s", () => {});
    expect(bus.subscriberCount("s")).toBe(1);
    off3();
    expect(bus.subscriberCount("s")).toBe(0);
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
    expect(bus.subscriberCount("s")).toBe(0);
  });

  test("publish to a subject with no subscribers is a no-op", () => {
    const bus = new InProcessEventBus();
    expect(() => bus.publish("no-subscribers", { anything: 1 })).not.toThrow();
    expect(bus.subscriberCount("no-subscribers")).toBe(0);
  });

  test("a throwing callback does not change subscriberCount", () => {
    const bus = new InProcessEventBus();
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    bus.subscribe("s", () => {
      throw new Error("boom");
    });
    bus.publish("s", { x: 1 });
    expect(bus.subscriberCount("s")).toBe(1);
    errorSpy.mockRestore();
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
});
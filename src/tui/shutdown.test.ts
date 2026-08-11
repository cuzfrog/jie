import { ShutdownSignalImpl } from "./shutdown";

describe("ShutdownSignalImpl", () => {
  test("request resolves the stopped promise", async () => {
    const signal = new ShutdownSignalImpl();
    const resolved = signal.stopped;
    signal.request();
    await resolved;
  });

  test("request is idempotent", async () => {
    const signal = new ShutdownSignalImpl();
    signal.request();
    signal.request();
    await signal.stopped;
  });
});

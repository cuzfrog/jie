import { GitServiceImpl, type GitSnapshot } from "./git-service";

describe("GitServiceImpl", () => {
  test("getSnapshot returns what the injected reader returns", () => {
    const snapshot: GitSnapshot = { branch: "feat", dirty: true, ahead: 2, behind: 1 };
    const svc = new GitServiceImpl("/tmp", () => snapshot);
    expect(svc.getSnapshot()).toEqual(snapshot);
  });

  test("getSnapshot re-reads on each call when minIntervalMs is 0", () => {
    let n = 0;
    const svc = new GitServiceImpl(
      "/tmp",
      () => {
        n += 1;
        return { branch: `b${n}`, dirty: false, ahead: 0, behind: 0 };
      },
      0,
    );
    expect(svc.getSnapshot().branch).toBe("b1");
    expect(svc.getSnapshot().branch).toBe("b2");
  });

  test("getSnapshot re-reads only when minIntervalMs has elapsed", () => {
    let clock = 0;
    let n = 0;
    const svc = new GitServiceImpl(
      "/tmp",
      () => {
        n += 1;
        return { branch: `b${n}`, dirty: false, ahead: 0, behind: 0 };
      },
      100,
      () => clock,
    );
    expect(svc.getSnapshot().branch).toBe("b1");
    clock = 50;
    expect(svc.getSnapshot().branch).toBe("b1");
    expect(svc.getSnapshot().branch).toBe("b1");
    clock = 200;
    expect(svc.getSnapshot().branch).toBe("b2");
    clock = 250;
    expect(svc.getSnapshot().branch).toBe("b2");
    clock = 1000;
    expect(svc.getSnapshot().branch).toBe("b3");
  });

  test("first getSnapshot always reads regardless of clock value", () => {
    let n = 0;
    const svc = new GitServiceImpl(
      "/tmp",
      () => {
        n += 1;
        return { branch: `b${n}`, dirty: false, ahead: 0, behind: 0 };
      },
      1_000_000,
      () => 0,
    );
    expect(svc.getSnapshot().branch).toBe("b1");
    expect(svc.getSnapshot().branch).toBe("b1");
  });
});

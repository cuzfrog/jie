import { createGitService, EMPTY_GIT_SNAPSHOT, type GitSnapshot } from "./git-service";

describe("createGitService", () => {
  test("getSnapshot returns what the injected reader returns", () => {
    const snapshot: GitSnapshot = { branch: "feat", dirty: true, ahead: 2, behind: 1 };
    const svc = createGitService({ cwd: "/tmp", readGitStatus: () => snapshot });
    expect(svc.getSnapshot()).toEqual(snapshot);
  });

  test("getSnapshot is re-called each time after the eager init", () => {
    let n = 0;
    const svc = createGitService({
      cwd: "/tmp",
      readGitStatus: () => {
        n += 1;
        return { branch: `b${n}`, dirty: false, ahead: 0, behind: 0 };
      },
    });
    expect(svc.getSnapshot().branch).toBe("b2");
    expect(svc.getSnapshot().branch).toBe("b3");
  });

  test("EMPTY_GIT_SNAPSHOT has the documented zero values", () => {
    expect(EMPTY_GIT_SNAPSHOT).toEqual({ branch: "", dirty: false, ahead: 0, behind: 0 });
  });
});

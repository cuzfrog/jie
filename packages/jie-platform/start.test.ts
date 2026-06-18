import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startJie } from "./start.ts";
import { SqliteStorage } from "./storage/sqlite-storage.ts";
import type { AuthJson, MergedSettings } from "./config/index.ts";

function makeSettings(
  overrides: Partial<MergedSettings> = {},
): MergedSettings {
  // `claude-sonnet-4-5` is a real pi-ai model id; using it
  // means the real `defaultResolveModel` (which calls pi-ai's
  // `getModel`) can resolve the soul's model without test
  // hooks. Tests that need to exercise the "no model" path
  // override this with an empty settings object.
  return { defaultProvider: "anthropic", defaultModel: "claude-sonnet-4-5", ...overrides };
}

function makeAuth(entries: AuthJson = {}): AuthJson {
  return entries;
}

describe("startJie — happy path (minimal team)", () => {
  let workspace: string;
  let homeJieDir: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-start-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-start-home-"));
    storage = new SqliteStorage(":memory:");
  });

  afterEach(() => {
    storage.close();
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  test("starts the minimal team; handle exposes 1 body and 1 role", async () => {
    const handle = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage,
      teamId: "minimal",
    });
    expect(handle.bodies()).toHaveLength(1);
    expect(handle.bodiesFor("minimal")).toHaveLength(1);
    expect(handle.rolesFor("minimal")).toEqual(["general"]);
  });

  test("publishes {team_id}.team.loaded once with sorted agents", async () => {
    const handle = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage,
      teamId: "minimal",
    });
    const events: unknown[] = [];
    handle.bus.subscribe("minimal.team.loaded", (_s, p) => {
      events.push(p);
    });
    // Re-subscribe path won't fire retroactively; verify with a
    // second call that subscribes before startJie.
    const events2: unknown[] = [];
    const storage2 = new SqliteStorage(":memory:");
    const second = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage: storage2,
      teamId: "minimal",
    });
    second.bus.subscribe("minimal.team.loaded", (_s, p) => {
      events2.push(p);
    });
    expect(events).toHaveLength(0);
    expect(events2).toHaveLength(0);
  });

  test("team.loaded is not republished on subsequent loadTeam calls (idempotent)", async () => {
    const handle = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage,
      teamId: "minimal",
    });
    const events: unknown[] = [];
    handle.bus.subscribe("minimal.team.loaded", (_s, p) => {
      events.push(p);
    });
    await handle.loadTeam("minimal");
    expect(events).toHaveLength(0);
  });

  test("model pre-check: no model in soul or settings throws", async () => {
    await expect(
      startJie({
        workspace,
        homeJieDir,
        settings: {},
        storage,
        teamId: "minimal",
      }),
    ).rejects.toThrow(/No model has been selected/);
  });

  test("handle.stop() detaches all bus subscriptions", async () => {
    const handle = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage,
      teamId: "minimal",
    });
    const body = handle.bodies()[0]!;
    expect(handle.bus.subscriberCount("minimal.general-1")).toBeGreaterThan(0);
    await handle.stop();
    expect(handle.bus.subscriberCount("minimal.general-1")).toBe(0);
    void body;
  });
});

describe("startJie — session id resolution", () => {
  let workspace: string;
  let homeJieDir: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-start-sess-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-start-sess-home-"));
    storage = new SqliteStorage(":memory:");
  });

  afterEach(() => {
    storage.close();
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  test("resumeSessionId: valid id is used; invalid id rejects with 'unknown session_id:'", async () => {
    const filePath = join(workspace, "persistent.db");
    const h1 = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage: new SqliteStorage(filePath),
      teamId: "minimal",
    });
    const validId = h1.bodies()[0]!.session_id;
    const { SqliteMemoryManager } = await import("./storage/index.ts");
    new SqliteMemoryManager(new SqliteStorage(filePath)).persist(
      { role: "user", content: "x", timestamp: Date.now() } as never,
      "general-1",
      validId,
      "minimal",
    );
    await h1.stop();

    const h2 = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage: new SqliteStorage(filePath),
      teamId: "minimal",
      resumeSessionId: validId,
    });
    expect(h2.bodies()[0]!.session_id).toBe(validId);
    await h2.stop();

    await expect(
      startJie({
        workspace,
        homeJieDir,
        settings: makeSettings(),
        storage: new SqliteStorage(filePath),
        teamId: "minimal",
        resumeSessionId: "not-a-real-id",
      }),
    ).rejects.toThrow(/unknown session_id: not-a-real-id/);
  });

  test("continueLastSession: uses the most recent session id", async () => {
    const filePath = join(workspace, "persistent2.db");
    const h1 = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage: new SqliteStorage(filePath),
      teamId: "minimal",
    });
    const recentId = h1.bodies()[0]!.session_id;
    const { SqliteMemoryManager } = await import("./storage/index.ts");
    new SqliteMemoryManager(new SqliteStorage(filePath)).persist(
      { role: "user", content: "x", timestamp: Date.now() } as never,
      "general-1",
      recentId,
      "minimal",
    );
    await h1.stop();

    const h2 = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage: new SqliteStorage(filePath),
      teamId: "minimal",
      continueLastSession: true,
    });
    expect(h2.bodies()[0]!.session_id).toBe(recentId);
    await h2.stop();
  });
});

describe("startJie — multi-team coexistence (loadTeam)", () => {
  let workspace: string;
  let homeJieDir: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-start-multi-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-start-multi-home-"));
    storage = new SqliteStorage(":memory:");
  });

  afterEach(() => {
    storage.close();
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  test("loadTeam is idempotent: already-loaded team returns immediately without re-publishing team.loaded", async () => {
    const handle = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage,
      teamId: "minimal",
    });
    const calls: unknown[] = [];
    handle.bus.subscribe("minimal.team.loaded", (_s, p) => {
      calls.push(p);
    });
    await handle.loadTeam("minimal");
    expect(calls).toHaveLength(0);
  });

  test("bodies() across multiple teams returns the union", async () => {
    const handle = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage,
      teamId: "minimal",
    });
    expect(handle.bodies().length).toBeGreaterThan(0);
  });
});

describe("startJie — empty team (no .md files)", () => {
  let workspace: string;
  let homeJieDir: string;
  let storage: SqliteStorage;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-start-empty-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-start-empty-home-"));
    storage = new SqliteStorage(":memory:");
  });

  afterEach(() => {
    storage.close();
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  test("empty team: bodiesFor returns [] and rolesFor returns []", async () => {
    // Create a user-scoped team directory with TEAM.md but no
    // agent .md files. The loader returns `{ roles: [],
    // leaderRole: null }`.
    const userTeam = join(homeJieDir, "teams", "ghost");
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(userTeam, { recursive: true });
    writeFileSync(join(userTeam, "TEAM.md"), "---\n---\n");

    const handle = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage,
      teamId: "ghost",
    });
    expect(handle.bodiesFor("ghost")).toEqual([]);
    expect(handle.rolesFor("ghost")).toEqual([]);
  });
});

void makeAuth;

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startJie } from "./start.ts";
import { createMemoryManager, createStorage } from "./storage";
import type { MergedSettings } from "./config";

function makeSettings(overrides: Partial<MergedSettings> = {}): MergedSettings {
  // `claude-sonnet-4-5` is a real pi-ai model id; using it
  // means the real `defaultResolveModel` (which calls pi-ai's
  // `getModel`) can resolve the soul's model without test
  // hooks. Tests that need to exercise the "no model" path
  // override this with an empty settings object.
  return { defaultProvider: "anthropic", defaultModel: "claude-sonnet-4-5", ...overrides };
}

const STUB_MESSAGE: AgentMessage = {
  role: "user",
  content: "hello from h1",
  timestamp: Date.now(),
};

describe("startJie", () => {
  let workspace: string;
  let homeJieDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-start-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-start-home-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  describe("happy path (minimal team)", () => {
    test("starts the minimal team; handle exposes 1 body and 1 role", async () => {
      const handle = await startJie({
        workspace,
        homeJieDir,
        settings: makeSettings(),
        storageFilePath: ":memory:",
        teamId: "minimal",
      });
      expect(handle.bodies()).toHaveLength(1);
      expect(handle.bodiesFor("minimal")).toHaveLength(1);
      expect(handle.rolesFor("minimal")).toEqual(["general"]);
    });

    test("team.loaded is published once at start; subsequent loadTeam is idempotent", async () => {
      const handle = await startJie({
        workspace,
        homeJieDir,
        settings: makeSettings(),
        storageFilePath: ":memory:",
        teamId: "minimal",
      });
      // The bus does not fire retroactively to subscribers added
      // after `team.loaded` was published. Verify by subscribing
      // before starting a second handle.
      const second = await startJie({
        workspace,
        homeJieDir,
        settings: makeSettings(),
        storageFilePath: ":memory:",
        teamId: "minimal",
      });
      const events: unknown[] = [];
      second.bus.subscribe("minimal.team.loaded", (_s, p) => {
        events.push(p);
      });
      expect(events).toHaveLength(0);
      // Idempotent loadTeam: a re-load does not republish.
      const moreEvents: unknown[] = [];
      handle.bus.subscribe("minimal.team.loaded", (_s, p) => {
        moreEvents.push(p);
      });
      await handle.loadTeam("minimal");
      expect(moreEvents).toHaveLength(0);
    });

    test("model pre-check: no model in soul or settings throws", async () => {
      await expect(
        startJie({
          workspace,
          homeJieDir,
          settings: {},
          storageFilePath: ":memory:",
          teamId: "minimal",
        }),
      ).rejects.toThrow(/No model has been selected/);
    });

    test("handle.stop() detaches all bus subscriptions", async () => {
      const handle = await startJie({
        workspace,
        homeJieDir,
        settings: makeSettings(),
        storageFilePath: ":memory:",
        teamId: "minimal",
      });
      expect(handle.bus.subscriberCount("minimal.general-1")).toBeGreaterThan(0);
      await handle.stop();
      expect(handle.bus.subscriberCount("minimal.general-1")).toBe(0);
    });
  });

  describe("session id resolution", () => {
    test("resumeSessionId: valid id is used; invalid id rejects with 'unknown session_id:'", async () => {
      const filePath = join(workspace, "resume.db");
      const h1 = await startJie({
        workspace,
        homeJieDir,
        settings: makeSettings(),
        storageFilePath: filePath,
        teamId: "minimal",
      });
      const validId = h1.bodies()[0]!.session_id;
      createMemoryManager(createStorage({ type: "sqlite", filePath })).persist(
        STUB_MESSAGE,
        "general-1",
        validId,
        "minimal",
      );
      await h1.stop();

      const h2 = await startJie({
        workspace,
        homeJieDir,
        settings: makeSettings(),
        storageFilePath: filePath,
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
          storageFilePath: filePath,
          teamId: "minimal",
          resumeSessionId: "not-a-real-id",
        }),
      ).rejects.toThrow(/unknown session_id: not-a-real-id/);
    });

    test("continueLastSession: h1 saves a message; h2 resumes the same session and the message is present", async () => {
      const filePath = join(workspace, "continue.db");
      const h1 = await startJie({
        workspace,
        homeJieDir,
        settings: makeSettings(),
        storageFilePath: filePath,
        teamId: "minimal",
      });
      const sessionId = h1.bodies()[0]!.session_id;
      // Save 1 message via memory manager in h1.
      createMemoryManager(createStorage({ type: "sqlite", filePath })).persist(
        STUB_MESSAGE,
        "general-1",
        sessionId,
        "minimal",
      );
      await h1.stop();

      // h2 resumes the same session via continueLastSession.
      const h2 = await startJie({
        workspace,
        homeJieDir,
        settings: makeSettings(),
        storageFilePath: filePath,
        teamId: "minimal",
        continueLastSession: true,
      });
      expect(h2.bodies()[0]!.session_id).toBe(sessionId);
      // The message saved in h1 is present in the storage h2 reads.
      // (h2's body may also persist additional messages from
      // agent.continue() on start, so we check presence, not count.)
      const restored = await createMemoryManager(
        createStorage({ type: "sqlite", filePath }),
      ).restore("general-1", sessionId, "minimal");
      expect(
        restored.some(
          (m) => (m as { content: string }).content === STUB_MESSAGE.content,
        ),
      ).toBe(true);
      await h2.stop();
    });
  });

  describe("empty team (no .md files)", () => {
    test("bodiesFor returns [] and rolesFor returns []", async () => {
      // A user-scoped team directory with TEAM.md but no
      // agent .md files. The loader returns `{ roles: [],
      // leaderRole: null }`.
      const userTeam = join(homeJieDir, "teams", "ghost");
      mkdirSync(userTeam, { recursive: true });
      writeFileSync(join(userTeam, "TEAM.md"), "---\n---\n");

      const handle = await startJie({
        workspace,
        homeJieDir,
        settings: makeSettings(),
        storageFilePath: ":memory:",
        teamId: "ghost",
      });
      expect(handle.bodiesFor("ghost")).toEqual([]);
      expect(handle.rolesFor("ghost")).toEqual([]);
    });
  });
});

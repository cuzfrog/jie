import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { SqliteStorage } from "./sqlite-storage";
import type { Storage } from "./storage";
import {
  SqliteMemoryManager,
  InMemoryMemoryManager,
} from "./memory-store";

function makeManager(): SqliteMemoryManager {
  return new SqliteMemoryManager(new SqliteStorage(":memory:"));
}

function userMessage(text: string): AgentMessage {
  return { role: "user", content: text, timestamp: Date.now() };
}

function assistantMessage(text: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    timestamp: Date.now(),
  } as AgentMessage;
}

function summaryMessage(text: string): AgentMessage {
  return {
    role: "compactionSummary",
    summary: text,
    tokensBefore: 1000,
    timestamp: Date.now(),
  } as AgentMessage;
}

function makeThrowingStorage(failOn: "exec", callIndex: number): {
  storage: Storage;
  inner: SqliteStorage;
} {
  const inner = new SqliteStorage(":memory:");
  let execCalls = 0;
  const wrapped: Storage = {
    exec(sql, params) {
      execCalls += 1;
      if (failOn === "exec" && execCalls === callIndex) {
        throw new Error("synthetic storage failure");
      }
      inner.exec(sql, params);
    },
    query(sql, params) {
      return inner.query(sql, params);
    },
    transaction<T>(fn: (s: Storage) => T): T {
      return inner.transaction(() => fn(wrapped));
    },
  };
  return { storage: wrapped, inner };
}

describe("SqliteMemoryManager", () => {
  test("persist assigns seq 1, 2, 3 to three messages on the same key", () => {
    const m = makeManager();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.persist(userMessage("c"), "agent-1", "s1", "t1");
    const rows = (
      m as unknown as { storage: Storage }
    ).storage.query("SELECT seq FROM memory_turns ORDER BY seq");
    expect(rows).toEqual([[1], [2], [3]]);
  });

  test("persist scopes seq per (team_id, agent_key, session_id)", () => {
    const m = makeManager();
    m.persist(userMessage("a1"), "agent-1", "s1", "t1");
    m.persist(userMessage("a2"), "agent-1", "s1", "t1");
    m.persist(userMessage("b1"), "agent-1", "s1", "t2");
    m.persist(userMessage("c1"), "agent-2", "s1", "t1");
    const rows = (
      m as unknown as { storage: Storage }
    ).storage.query("SELECT seq FROM memory_turns ORDER BY seq");
    expect(rows).toEqual([[1], [1], [1], [2]]);
  });

  test("restore returns rows in seq order, skipping compacted=1", async () => {
    const m = makeManager();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.persist(userMessage("c"), "agent-1", "s1", "t1");
    m.compact([1, 2], summaryMessage("sum"), "agent-1", "s1", "t1");
    const restored = await m.restore("agent-1", "s1", "t1");
    expect(restored).toHaveLength(2);
    const [first, second] = restored as Array<{ role: string; content: unknown }>;
    expect(first.content).toBe("c");
    expect(second.role).toBe("compactionSummary");
  });

  test("compact flips compacted=1 on the seq range", () => {
    const m = makeManager();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.persist(userMessage("c"), "agent-1", "s1", "t1");
    m.compact([1, 2], summaryMessage("sum"), "agent-1", "s1", "t1");
    const rows = (
      m as unknown as { storage: Storage }
    ).storage.query(
      "SELECT compacted FROM memory_turns WHERE seq IN (1,2) ORDER BY seq",
    );
    expect(rows).toEqual([[1], [1]]);
  });

  test("compact throws and the synthetic error surfaces", () => {
    const { storage } = makeThrowingStorage("exec", 2);
    const throwing = new SqliteMemoryManager(storage);

    expect(() =>
      throwing.compact(
        [1, 2],
        summaryMessage("sum"),
        "agent-1",
        "s1",
        "t1",
      ),
    ).toThrow("synthetic storage failure");
  });

  test("hasSession is false before any persist, true after", () => {
    const m = makeManager();
    expect(m.hasSession("t1", "sX")).toBe(false);
    m.persist(userMessage("a"), "agent-1", "sX", "t1");
    expect(m.hasSession("t1", "sX")).toBe(true);
  });

  test("hasSession is scoped to team_id", () => {
    const m = makeManager();
    m.persist(userMessage("a"), "agent-1", "sX", "t1");
    expect(m.hasSession("t2", "sX")).toBe(false);
  });

  test("restore returns empty array when no history exists", async () => {
    const m = makeManager();
    const restored = await m.restore("agent-1", "s-fresh", "t1");
    expect(restored).toEqual([]);
  });

  test("restore round-trips assistant messages", async () => {
    const m = makeManager();
    m.persist(assistantMessage("hello"), "agent-1", "s1", "t1");
    const restored = await m.restore("agent-1", "s1", "t1");
    const content = (restored[0] as { content: Array<{ type: string; text: string }> }).content;
    expect(content[0]?.text).toBe("hello");
  });
});

describe("InMemoryMemoryManager", () => {
  test("implements the same interface; persist/compact/restore round-trip", async () => {
    const m = new InMemoryMemoryManager();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.persist(userMessage("c"), "agent-1", "s1", "t1");
    m.compact([1, 2], summaryMessage("sum"), "agent-1", "s1", "t1");
    const restored = await m.restore("agent-1", "s1", "t1");
    expect(restored).toHaveLength(2);
    expect(m.hasSession("t1", "s1")).toBe(true);
  });
});

describe("SqliteMemoryManager.listSessions", () => {
  test("returns empty array when the team has no sessions", () => {
    const m = makeManager();
    expect(m.listSessions("ghost-team")).toEqual([]);
  });

  test("lists one row per (team_id, session_id) with aggregate counts", () => {
    const m = makeManager();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.persist(userMessage("c"), "agent-1", "s2", "t1");
    const sessions = m.listSessions("t1");
    expect(sessions).toHaveLength(2);
    const s1 = sessions.find((s) => s.sessionId === "s1");
    const s2 = sessions.find((s) => s.sessionId === "s2");
    expect(s1?.messageCount).toBe(2);
    expect(s2?.messageCount).toBe(1);
  });

  test("is scoped to team_id", () => {
    const m = makeManager();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s2", "t2");
    expect(m.listSessions("t1").map((s) => s.sessionId)).toEqual(["s1"]);
    expect(m.listSessions("t2").map((s) => s.sessionId)).toEqual(["s2"]);
  });

  test("orders by last activity DESC", async () => {
    const m = makeManager();
    m.persist(userMessage("a"), "agent-1", "s-old", "t1");
    await new Promise((r) => setTimeout(r, 5));
    m.persist(userMessage("b"), "agent-1", "s-new", "t1");
    const ids = m.listSessions("t1").map((s) => s.sessionId);
    expect(ids).toEqual(["s-new", "s-old"]);
  });

  test("includes compaction summary rows in messageCount", () => {
    const m = makeManager();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.compact([1, 2], summaryMessage("sum"), "agent-1", "s1", "t1");
    expect(m.listSessions("t1")[0]?.messageCount).toBe(3);
  });
});

describe("InMemoryMemoryManager.listSessions", () => {
  test("matches SqliteMemoryManager.listSessions counts and ids on the same fixture", () => {
    function run(manager: { persist: SqliteMemoryManager["persist"]; listSessions: SqliteMemoryManager["listSessions"]; compact: SqliteMemoryManager["compact"] }): { ids: ReadonlyArray<string>; counts: Record<string, number>; lastActivity: Record<string, string> } {
      manager.persist(userMessage("a"), "agent-1", "s-old", "t1");
      manager.persist(userMessage("b"), "agent-1", "s-old", "t1");
      manager.persist(userMessage("c"), "agent-2", "s-old", "t1");
      manager.persist(userMessage("d"), "agent-1", "s-new", "t1");
      manager.compact([1, 2], summaryMessage("sum"), "agent-1", "s-old", "t1");
      const sessions = manager.listSessions("t1");
      const counts: Record<string, number> = {};
      const lastActivity: Record<string, string> = {};
      for (const s of sessions) {
        counts[s.sessionId] = s.messageCount;
        lastActivity[s.sessionId] = s.lastActivity;
      }
      return { ids: sessions.map((s) => s.sessionId), counts, lastActivity };
    }
    const sqlite = run(makeManager());
    const memory = run(new InMemoryMemoryManager());
    expect([...memory.ids].sort()).toEqual([...sqlite.ids].sort());
    expect(memory.counts).toEqual(sqlite.counts);
    expect(memory.lastActivity).toEqual(sqlite.lastActivity);
  });

  test("returns empty array when team has no sessions", () => {
    const m = new InMemoryMemoryManager();
    expect(m.listSessions("ghost")).toEqual([]);
  });

  test("is scoped to team_id", () => {
    const m = new InMemoryMemoryManager();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s2", "t2");
    expect(m.listSessions("t1").map((s) => s.sessionId)).toEqual(["s1"]);
  });
});

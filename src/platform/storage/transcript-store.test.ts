import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { SqliteStorage } from "./sqlite-storage";
import type { Storage } from "./storage";
import { SqliteTranscriptStore } from "./transcript-store";

function makeTranscriptStore(): SqliteTranscriptStore {
  return new SqliteTranscriptStore(new SqliteStorage(":memory:"));
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

describe("SqliteTranscriptStore", () => {
  test("persist assigns seq 1, 2, 3 to three messages on the same key", () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.persist(userMessage("c"), "agent-1", "s1", "t1");
    const rows = (
      m as unknown as { storage: Storage }
    ).storage.query("SELECT seq FROM memory_turns ORDER BY seq");
    expect(rows).toEqual([[1], [2], [3]]);
  });

  test("persist scopes seq per (team_id, agent_key, session_id)", () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a1"), "agent-1", "s1", "t1");
    m.persist(userMessage("a2"), "agent-1", "s1", "t1");
    m.persist(userMessage("b1"), "agent-1", "s1", "t2");
    m.persist(userMessage("c1"), "agent-2", "s1", "t1");
    const rows = (
      m as unknown as { storage: Storage }
    ).storage.query("SELECT seq FROM memory_turns ORDER BY seq");
    expect(rows).toEqual([[1], [1], [1], [2]]);
  });

  test("restore returns the summary first, then remaining rows in seq order, skipping compacted=1", async () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.persist(userMessage("c"), "agent-1", "s1", "t1");
    m.compact(2, summaryMessage("sum"), "agent-1", "s1", "t1");
    const restored = await m.restore("agent-1", "s1", "t1");
    expect(restored).toHaveLength(2);
    const [first, second] = restored as Array<{ role: string; content: unknown }>;
    expect(first.role).toBe("compactionSummary");
    expect(second.content).toBe("c");
  });

  test("compact flips compacted=1 on the oldest N non-compacted rows", () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.persist(userMessage("c"), "agent-1", "s1", "t1");
    m.compact(2, summaryMessage("sum"), "agent-1", "s1", "t1");
    const rows = (
      m as unknown as { storage: Storage }
    ).storage.query(
      "SELECT compacted FROM memory_turns ORDER BY seq",
    );
    expect(rows).toEqual([[1], [1], [0], [0]]);
  });

  test("compact places the summary row between the compacted prefix and the retained tail", () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.persist(userMessage("c"), "agent-1", "s1", "t1");
    m.compact(2, summaryMessage("sum"), "agent-1", "s1", "t1");
    const rows = (
      m as unknown as { storage: Storage }
    ).storage.query(
      "SELECT role FROM memory_turns ORDER BY seq",
    );
    expect(rows).toEqual([["user"], ["user"], ["compactionSummary"], ["user"]]);
  });

  test("a second compaction consumes the previous summary row", async () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.persist(userMessage("c"), "agent-1", "s1", "t1");
    m.persist(userMessage("d"), "agent-1", "s1", "t1");
    m.compact(2, summaryMessage("sum-1"), "agent-1", "s1", "t1");
    m.compact(2, summaryMessage("sum-2"), "agent-1", "s1", "t1");
    const restored = await m.restore("agent-1", "s1", "t1") as Array<{ role: string; summary?: string }>;
    expect(restored).toHaveLength(2);
    expect(restored[0]).toMatchObject({ role: "compactionSummary", summary: "sum-2" });
    expect(restored[1]).toMatchObject({ role: "user", content: "d" });
  });

  test("compact clamps when the count exceeds the non-compacted rows", async () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.compact(99, summaryMessage("sum"), "agent-1", "s1", "t1");
    const restored = await m.restore("agent-1", "s1", "t1");
    expect(restored).toHaveLength(1);
    expect((restored[0] as { role: string }).role).toBe("compactionSummary");
  });

  test("compact throws and the transaction rolls back, leaving the rows untouched", async () => {
    const { storage, inner } = makeThrowingStorage("exec", 3);
    const seeding = new SqliteTranscriptStore(inner);
    seeding.persist(userMessage("a"), "agent-1", "s1", "t1");
    seeding.persist(userMessage("b"), "agent-1", "s1", "t1");
    const throwing = new SqliteTranscriptStore(storage);

    expect(() =>
      throwing.compact(
        1,
        summaryMessage("sum"),
        "agent-1",
        "s1",
        "t1",
      ),
    ).toThrow("synthetic storage failure");
    const restored = await throwing.restore("agent-1", "s1", "t1") as Array<{ content: unknown }>;
    expect(restored.map((row) => row.content)).toEqual(["a", "b"]);
  });

  test("hasSession is false before any persist, true after", () => {
    const m = makeTranscriptStore();
    expect(m.hasSession("t1", "sX")).toBe(false);
    m.persist(userMessage("a"), "agent-1", "sX", "t1");
    expect(m.hasSession("t1", "sX")).toBe(true);
  });

  test("hasSession is scoped to team_id", () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "sX", "t1");
    expect(m.hasSession("t2", "sX")).toBe(false);
  });

  test("restore returns empty array when no history exists", async () => {
    const m = makeTranscriptStore();
    const restored = await m.restore("agent-1", "s-fresh", "t1");
    expect(restored).toEqual([]);
  });

  test("restore round-trips assistant messages", async () => {
    const m = makeTranscriptStore();
    m.persist(assistantMessage("hello"), "agent-1", "s1", "t1");
    const restored = await m.restore("agent-1", "s1", "t1");
    const content = (restored[0] as { content: Array<{ type: string; text: string }> }).content;
    expect(content[0]?.text).toBe("hello");
  });

  test("restore round-trips thinkingDurationMs on assistant thinking content", async () => {
    const m = makeTranscriptStore();
    const message: AgentMessage = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "hmm", thinkingDurationMs: 250 }],
      timestamp: Date.now(),
    } as AgentMessage;
    m.persist(message, "agent-1", "s1", "t1");
    const restored = await m.restore("agent-1", "s1", "t1");
    const content = (restored[0] as { content: Array<{ type: string; thinkingDurationMs?: number }> }).content;
    expect(content[0]?.thinkingDurationMs).toBe(250);
  });
});

describe("SqliteTranscriptStore.listSessions", () => {
  test("returns empty array when the team has no sessions", () => {
    const m = makeTranscriptStore();
    expect(m.listSessions("ghost-team")).toEqual([]);
  });

  test("lists one row per (team_id, session_id) with aggregate counts", () => {
    const m = makeTranscriptStore();
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
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s2", "t2");
    expect(m.listSessions("t1").map((s) => s.sessionId)).toEqual(["s1"]);
    expect(m.listSessions("t2").map((s) => s.sessionId)).toEqual(["s2"]);
  });

  test("orders by last activity DESC", async () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s-old", "t1");
    await new Promise((r) => setTimeout(r, 5));
    m.persist(userMessage("b"), "agent-1", "s-new", "t1");
    const ids = m.listSessions("t1").map((s) => s.sessionId);
    expect(ids).toEqual(["s-new", "s-old"]);
  });

  test("messageCount counts non-compacted rows only, including the summary row", () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.persist(userMessage("c"), "agent-1", "s1", "t1");
    m.compact(2, summaryMessage("sum"), "agent-1", "s1", "t1");
    expect(m.listSessions("t1")[0]?.messageCount).toBe(2);
  });

  test("surfaces a renamed session's name", () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.renameSession("s1", "my session");
    expect(m.listSessions("t1")[0]?.name).toBe("my session");
  });

  test("leaves name undefined for sessions without metadata", () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s2", "t1");
    m.renameSession("s1", "named");
    const sessions = m.listSessions("t1");
    expect(sessions.find((s) => s.sessionId === "s1")?.name).toBe("named");
    expect(sessions.find((s) => s.sessionId === "s2")?.name).toBeUndefined();
  });
});

describe("SqliteTranscriptStore.renameSession", () => {
  test("upserts: the second rename replaces the first, keeping a single metadata row", () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.renameSession("s1", "first name");
    m.renameSession("s1", "second name");
    expect(m.listSessions("t1")[0]?.name).toBe("second name");
    const rows = (m as unknown as { storage: Storage }).storage.query("SELECT session_id, name, updated_at FROM session_metadata");
    expect(rows).toHaveLength(1);
    expect(rows[0]![0]).toBe("s1");
    expect(rows[0]![1]).toBe("second name");
    expect(typeof rows[0]![2]).toBe("string");
    expect((rows[0]![2] as string).length).toBeGreaterThan(0);
  });
});

describe("SqliteTranscriptStore.sessionName", () => {
  test("returns null for a session without metadata", () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    expect(m.sessionName("s1")).toBeNull();
  });

  test("returns the renamed session's name", () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.renameSession("s1", "my session");
    expect(m.sessionName("s1")).toBe("my session");
  });

  test("returns null for an unknown session id", () => {
    const m = makeTranscriptStore();
    expect(m.sessionName("ghost")).toBeNull();
  });
});

describe("SqliteTranscriptStore.listAgentKeys", () => {
  test("returns the distinct agent keys for a team/session", () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-2", "s1", "t1");
    m.persist(userMessage("c"), "agent-1", "s2", "t1");
    m.persist(userMessage("d"), "agent-3", "s1", "t2");
    expect(m.listAgentKeys("t1", "s1")).toEqual(["agent-1", "agent-2"]);
  });

  test("returns an empty array when no rows exist", () => {
    const m = makeTranscriptStore();
    expect(m.listAgentKeys("t1", "s1")).toEqual([]);
  });
});

describe("SqliteTranscriptStore.remove", () => {
  test("removes all rows for the agent/session/team", async () => {
    const m = makeTranscriptStore();
    m.persist(userMessage("a"), "agent-1", "s1", "t1");
    m.persist(userMessage("b"), "agent-1", "s1", "t1");
    m.persist(userMessage("c"), "agent-2", "s1", "t1");
    m.remove("agent-1", "s1", "t1");
    expect(m.listAgentKeys("t1", "s1")).toEqual(["agent-2"]);
    expect(await m.restore("agent-1", "s1", "t1")).toEqual([]);
  });

  test("is no-op for an unknown agent/session/team", () => {
    const m = makeTranscriptStore();
    m.remove("agent-1", "s1", "t1");
    expect(m.listAgentKeys("t1", "s1")).toEqual([]);
  });
});

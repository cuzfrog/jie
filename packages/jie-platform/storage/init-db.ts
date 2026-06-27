import type { Storage } from "./storage";

export function initializeSchema(storage: Storage): void {
  storage.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      key        TEXT PRIMARY KEY,
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  storage.exec(`
    CREATE TABLE IF NOT EXISTS memory_turns (
      team_id    TEXT    NOT NULL,
      agent_key  TEXT    NOT NULL,
      session_id TEXT    NOT NULL,
      seq        INTEGER NOT NULL,
      role       TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      compacted  INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    NOT NULL,
      PRIMARY KEY (team_id, agent_key, session_id, seq)
    )
  `);

  storage.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_turns_team_session_created
    ON memory_turns (team_id, session_id, created_at)
  `);
}

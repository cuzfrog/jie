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

  storage.exec(`
    CREATE TABLE IF NOT EXISTS session_metadata (
      session_id TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  storage.exec(`
    CREATE TABLE IF NOT EXISTS memory_atoms (
      id                TEXT    PRIMARY KEY,
      team_id           TEXT    NOT NULL,
      content           TEXT    NOT NULL,
      type              TEXT    NOT NULL,
      priority          INTEGER NOT NULL DEFAULT 50,
      scene             TEXT    NOT NULL DEFAULT '',
      source_session_id TEXT    NOT NULL,
      created_at        TEXT    NOT NULL,
      updated_at        TEXT    NOT NULL
    )
  `);

  storage.exec(`
    CREATE INDEX IF NOT EXISTS idx_memory_atoms_team
    ON memory_atoms (team_id, priority DESC, updated_at DESC)
  `);

  storage.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_atoms_dedup
    ON memory_atoms (team_id, type, content)
  `);

  createMemoryFtsTableIfNotExists(storage);

  storage.exec(`
    CREATE TABLE IF NOT EXISTS kanban_tasks (
      team_id      TEXT    NOT NULL,
      session_id   TEXT    NOT NULL DEFAULT '',
      seq          INTEGER NOT NULL,
      id           TEXT    NOT NULL,
      content      TEXT    NOT NULL,
      status       TEXT    NOT NULL,
      scope         TEXT    NOT NULL,
      active_form   TEXT,
      description   TEXT,
      completed_at  TEXT,
      external_ref  TEXT,
      assignee     TEXT,
      todos         TEXT,
      updated_at    TEXT    NOT NULL,
      PRIMARY KEY (team_id, id)
    )
  `);

  storage.exec(`
    CREATE TABLE IF NOT EXISTS kanban_counters (
      team_id    TEXT    NOT NULL,
      next_id    INTEGER NOT NULL,
      PRIMARY KEY (team_id)
    )
  `);

  storage.exec(`
    CREATE TABLE IF NOT EXISTS session_agent_usage (
      team_id      TEXT    NOT NULL,
      session_id   TEXT    NOT NULL,
      agent_key    TEXT    NOT NULL,
      input_tokens  INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      updated_at   TEXT    NOT NULL,
      PRIMARY KEY (team_id, session_id, agent_key)
    )
  `);
}

function createMemoryFtsTableIfNotExists(storage: Storage): void {
  storage.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_atoms_fts USING fts5(
      content, atom_id UNINDEXED, tokenize = 'trigram'
    )
  `);
}

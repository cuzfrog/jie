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

  // Remove any duplicate (team, type, content) rows that may exist from older
  // schema versions before we add the unique index below. One memory per team,
  // type, and content is the intended invariant.
  storage.exec(`
    DELETE FROM memory_atoms
    WHERE rowid NOT IN (
      SELECT MIN(rowid) FROM memory_atoms GROUP BY team_id, type, content
    )
  `);

  storage.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_atoms_dedup
    ON memory_atoms (team_id, type, content)
  `);

  migrateMemoryFts(storage);
  createMemoryFtsTableIfNotExists(storage);
  maybeRebuildMemoryFts(storage);

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

  migrateKanban(storage);
}

function migrateMemoryFts(storage: Storage): void {
  const rows = storage.query(
    `SELECT sql FROM sqlite_master WHERE name = 'memory_atoms_fts' AND type = 'table'`,
  );
  if (rows.length === 0) return;
  const sql = rows[0]![0];
  if (typeof sql !== "string") return;
  if (sql.includes("tokenize='trigram'") || sql.includes("tokenize = 'trigram'")) return;
  storage.exec("DROP TABLE IF EXISTS memory_atoms_fts");
}

function createMemoryFtsTableIfNotExists(storage: Storage): void {
  storage.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_atoms_fts USING fts5(
      content, atom_id UNINDEXED, tokenize = 'trigram'
    )
  `);
}

function maybeRebuildMemoryFts(storage: Storage): void {
  const ftsCount = countRows(storage, "memory_atoms_fts");
  const memoryCount = countRows(storage, "memory_atoms");
  if (ftsCount === 0 && memoryCount > 0) {
    storage.exec("INSERT INTO memory_atoms_fts (content, atom_id) SELECT content, id FROM memory_atoms");
  }
}

function countRows(storage: Storage, tableName: string): number {
  const rows = storage.query(`SELECT COUNT(*) FROM ${tableName}`);
  if (rows.length === 0) return 0;
  const value = rows[0]![0];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  return 0;
}

function migrateKanban(storage: Storage): void {
  const tasksInfo = storage.query("PRAGMA table_info(kanban_tasks)");

  const cardsInfo = storage.query("PRAGMA table_info(kanban_cards)");
  if (cardsInfo.length > 0) {
    if (!cardsInfo.some((row) => row[1] === "scope")) {
      storage.exec("ALTER TABLE kanban_cards ADD COLUMN scope TEXT NOT NULL DEFAULT 'team'");
    }
    if (tasksInfo.length > 0) {
      storage.exec(`
        INSERT OR IGNORE INTO kanban_tasks
          (team_id, session_id, seq, id, content, status, scope, active_form, description, completed_at, external_ref, updated_at)
        SELECT
          team_id, session_id, seq, id, content, status, scope, active_form, description, completed_at, external_ref, updated_at
        FROM kanban_cards
      `);
      storage.exec("DROP TABLE kanban_cards");
    } else {
      storage.exec("ALTER TABLE kanban_cards RENAME TO kanban_tasks");
    }
  }

  const finalInfo = storage.query("PRAGMA table_info(kanban_tasks)");
  if (finalInfo.length > 0 && !finalInfo.some((row) => row[1] === "todos")) {
    storage.exec("ALTER TABLE kanban_tasks ADD COLUMN todos TEXT");
  }
  if (finalInfo.some((row) => row[1] === "scope")) {
    storage.exec("PRAGMA user_version = 1");
    return;
  }

  if (finalInfo.length > 0) {
    storage.exec("ALTER TABLE kanban_tasks ADD COLUMN scope TEXT NOT NULL DEFAULT 'team'");
    storage.exec("PRAGMA user_version = 1");
  }
}

import type { Storage } from "./storage.ts";
import { JiePlatformError } from "./domain-types.ts";

/** Work-product persistence domain interface. The platform imposes no
 *  schema, no reserved prefixes, no automatic scoping — the team
 *  decides its key conventions (per ADR 7). */
export interface ArtifactStore {
  /** Store `content` at `key`. Overwrites if the key exists. Returns
   *  the canonical `{ key, created_at }` so the LLM can reference the
   *  artifact in subsequent event payloads. */
  write(
    key: string,
    content: string,
  ): Promise<{ key: string; created_at: string }>;

  /** Read the entry at `key`, or `null` if not found. A missing
   *  artifact is a normal result, not a tool error. */
  read(key: string): Promise<{
    key: string;
    content: string;
    created_at: string;
  } | null>;

  /** Return all keys with the given prefix, ordered by
   *  `created_at DESC`. `LIKE` metacharacters in the prefix are
   *  escaped so the caller's input is treated literally. */
  list(prefix: string): Promise<{ key: string; created_at: string }[]>;
}

const ARTIFACT_KEY_PATTERN = /^[A-Za-z0-9_./-]{1,256}$/;
const ARTIFACT_CONTENT_MAX = 5 * 1024 * 1024; // 5 MiB

function validateArtifactKey(key: string): void {
  if (!ARTIFACT_KEY_PATTERN.test(key)) {
    throw new JiePlatformError(
      "invalid_artifact_key",
      `invalid_artifact_key: ${key}`,
    );
  }
}

function validateArtifactContent(content: string): void {
  if (content.length > ARTIFACT_CONTENT_MAX) {
    throw new JiePlatformError(
      "artifact_too_large",
      `artifact_too_large: ${content.length}`,
    );
  }
}

function escapeLikePrefix(prefix: string): string {
  return prefix
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/** Default `ArtifactStore` implementation. SQL is written at the call
 *  site; the row shape is typed at the extraction point. The `Storage`
 *  reference is the only persistence handle. */
export class SqliteArtifactStore implements ArtifactStore {
  constructor(private readonly storage: Storage) {}

  async write(
    key: string,
    content: string,
  ): Promise<{ key: string; created_at: string }> {
    validateArtifactKey(key);
    validateArtifactContent(content);
    const created_at = new Date().toISOString();
    this.storage.exec(
      `INSERT OR REPLACE INTO artifacts (key, content, created_at) VALUES (?, ?, ?)`,
      [key, content, created_at],
    );
    return { key, created_at };
  }

  async read(key: string): Promise<{
    key: string;
    content: string;
    created_at: string;
  } | null> {
    const rows = this.storage.query(
      `SELECT key, content, created_at FROM artifacts WHERE key = ?`,
      [key],
    );
    if (rows.length === 0) return null;
    return {
      key: rows[0]![0] as string,
      content: rows[0]![1] as string,
      created_at: rows[0]![2] as string,
    };
  }

  async list(prefix: string): Promise<{ key: string; created_at: string }[]> {
    const escaped = escapeLikePrefix(prefix);
    const rows = this.storage.query(
      `SELECT key, created_at FROM artifacts WHERE key LIKE ? ESCAPE '\\' ORDER BY created_at DESC`,
      [`${escaped}%`],
    );
    return rows.map((row) => ({
      key: row[0] as string,
      created_at: row[1] as string,
    }));
  }
}

/** In-memory mock used by tests. Implements the same `ArtifactStore`
 *  interface; no persistence. */
export class InMemoryArtifactStore implements ArtifactStore {
  private readonly rows = new Map<string, { content: string; created_at: string }>();

  async write(
    key: string,
    content: string,
  ): Promise<{ key: string; created_at: string }> {
    validateArtifactKey(key);
    validateArtifactContent(content);
    const created_at = new Date().toISOString();
    this.rows.set(key, { content, created_at });
    return { key, created_at };
  }

  async read(key: string): Promise<{
    key: string;
    content: string;
    created_at: string;
  } | null> {
    const row = this.rows.get(key);
    if (row === undefined) return null;
    return { key, ...row };
  }

  async list(prefix: string): Promise<{ key: string; created_at: string }[]> {
    const results: { key: string; created_at: string }[] = [];
    for (const [key, value] of this.rows) {
      if (key.startsWith(prefix)) results.push({ key, ...value });
    }
    results.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return results;
  }
}
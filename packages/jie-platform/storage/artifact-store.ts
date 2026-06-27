import type { Storage } from "./storage";
import { JiePlatformError } from "../domain-types";

export interface ArtifactStore {

  write(
    key: string,
    content: string,
  ): Promise<{ key: string; created_at: string }>;

  read(key: string): Promise<{
    key: string;
    content: string;
    created_at: string;
  } | null>;

  list(prefix: string): Promise<{ key: string; created_at: string }[]>;
}

export function createArtifactStore(storage: Storage): ArtifactStore {
  return new SqliteArtifactStore(storage);
}

const ARTIFACT_KEY_PATTERN = /^[A-Za-z0-9_./-]{1,256}$/;
const ARTIFACT_CONTENT_MAX = 5 * 1024 * 1024;

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

export class SqliteArtifactStore implements ArtifactStore {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

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

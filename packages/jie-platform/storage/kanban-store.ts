import type { KanbanCard, KanbanCardWrite, KanbanStatus } from "../types";
import type { Storage } from "./storage";

export interface KanbanStore {
  load(teamId: string, sessionId: string): ReadonlyArray<KanbanCard>;
  replace(teamId: string, sessionId: string, incoming: ReadonlyArray<KanbanCardWrite>): ReadonlyArray<KanbanCard>;
  add(teamId: string, sessionId: string, content: string, description: string | undefined): KanbanCard | null;
  remove(teamId: string, sessionId: string, cardId: string): boolean;
  complete(teamId: string, sessionId: string, cardId: string): boolean;
  editContent(teamId: string, sessionId: string, cardId: string, content: string): KanbanCard | null;
}

export class SqliteKanbanStore implements KanbanStore {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  load(teamId: string, sessionId: string): ReadonlyArray<KanbanCard> {
    const rows = this.storage.query(
      `SELECT id, content, status, active_form, description FROM kanban_cards
       WHERE team_id = ? AND session_id = ? ORDER BY seq`,
      [teamId, sessionId],
    );
    return rows.map((row) => ({
      id: row[0] as string,
      content: row[1] as string,
      status: row[2] as KanbanStatus,
      ...withOptional(row[3], "active_form"),
      ...withOptional(row[4], "description"),
    }));
  }

  replace(teamId: string, sessionId: string, incoming: ReadonlyArray<KanbanCardWrite>): ReadonlyArray<KanbanCard> {
    const existing = this.load(teamId, sessionId);
    const merged = mergeIncoming(existing, incoming, (): string => this.nextCardId(teamId, sessionId));
    this.persist(teamId, sessionId, merged);
    return merged;
  }

  add(teamId: string, sessionId: string, content: string, description: string | undefined): KanbanCard | null {
    const existing = this.load(teamId, sessionId);
    if (existing.some((card) => card.content === content)) return null;
    const card: KanbanCard = {
      id: this.nextCardId(teamId, sessionId),
      content,
      status: "pending",
      ...(description === undefined ? {} : { description }),
    };
    this.persist(teamId, sessionId, [...existing, card]);
    return card;
  }

  remove(teamId: string, sessionId: string, cardId: string): boolean {
    const existing = this.load(teamId, sessionId);
    const next = existing.filter((card) => card.id !== cardId);
    if (next.length === existing.length) return false;
    this.persist(teamId, sessionId, next);
    return true;
  }

  complete(teamId: string, sessionId: string, cardId: string): boolean {
    const existing = this.load(teamId, sessionId);
    if (!existing.some((card) => card.id === cardId)) return false;
    this.persist(teamId, sessionId, existing.map((card) => (card.id === cardId ? { ...card, status: "completed" as const } : card)));
    return true;
  }

  editContent(teamId: string, sessionId: string, cardId: string, content: string): KanbanCard | null {
    const existing = this.load(teamId, sessionId);
    const index = existing.findIndex((card) => card.id === cardId);
    if (index === -1) return null;
    if (existing.some((card) => card.id !== cardId && card.content === content)) return null;
    const card = { ...existing[index]!, content };
    this.persist(teamId, sessionId, existing.map((c) => (c.id === cardId ? card : c)));
    return card;
  }

  private persist(teamId: string, sessionId: string, cards: ReadonlyArray<KanbanCard>): void {
    this.storage.transaction((s) => {
      s.exec(`DELETE FROM kanban_cards WHERE team_id = ? AND session_id = ?`, [teamId, sessionId]);
      for (let seq = 0; seq < cards.length; seq += 1) {
        const card = cards[seq]!;
        s.exec(
          `INSERT INTO kanban_cards (team_id, session_id, seq, id, content, status, active_form, description, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [teamId, sessionId, seq, card.id, card.content, card.status, card.active_form ?? null, card.description ?? null, new Date().toISOString()],
        );
      }
    });
  }

  private nextCardId(teamId: string, sessionId: string): string {
    const rows = this.storage.query(`SELECT next_id FROM kanban_counters WHERE team_id = ? AND session_id = ?`, [teamId, sessionId]);
    const next = (rows[0]?.[0] as number | undefined) ?? 1;
    this.storage.exec(
      `INSERT INTO kanban_counters (team_id, session_id, next_id) VALUES (?, ?, ?)
       ON CONFLICT(team_id, session_id) DO UPDATE SET next_id = excluded.next_id`,
      [teamId, sessionId, next + 1],
    );
    return `K${next}`;
  }
}

function mergeIncoming(
  existing: ReadonlyArray<KanbanCard>,
  incoming: ReadonlyArray<KanbanCardWrite>,
  nextCardId: () => string,
): KanbanCard[] {
  const byContent = new Map(existing.map((card) => [card.content, card]));
  const writes = new Map<string, KanbanCardWrite>();
  for (const write of incoming) writes.set(write.content, write);
  return [...writes.values()].map((write) => {
    const prior = byContent.get(write.content);
    if (prior === undefined) {
      return {
        id: nextCardId(),
        content: write.content,
        status: write.status,
        ...(write.active_form === undefined ? {} : { active_form: write.active_form }),
        ...(write.description === undefined ? {} : { description: write.description }),
      };
    }
    return {
      ...prior,
      status: write.status,
      ...(write.active_form === undefined ? {} : { active_form: write.active_form }),
      ...(write.description === undefined ? {} : { description: write.description }),
    };
  });
}

function withOptional(value: unknown, key: "active_form" | "description"): { [K in typeof key]?: string } {
  return value === null ? {} : { [key]: value as string };
}

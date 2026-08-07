import type { KanbanCard, KanbanCardWrite, KanbanStatus } from "../types";
import type { Storage } from "./storage";

const TEAM_SESSION = "";

export interface KanbanStore {
  load(teamId: string, sessionId: string): ReadonlyArray<KanbanCard>;
  replace(teamId: string, sessionId: string, incoming: ReadonlyArray<KanbanCardWrite>): ReadonlyArray<KanbanCard>;
  add(teamId: string, sessionId: string, content: string, description: string | undefined, scope?: "team" | "session"): KanbanCard | null;
  remove(teamId: string, sessionId: string, cardId: string): boolean;
  setStatus(teamId: string, sessionId: string, cardId: string, status: KanbanStatus): boolean;
  editContent(teamId: string, sessionId: string, cardId: string, content: string): KanbanCard | null;
  editDescription(teamId: string, sessionId: string, cardId: string, description: string | undefined): KanbanCard | null;
}

export class SqliteKanbanStore implements KanbanStore {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  load(teamId: string, sessionId: string): ReadonlyArray<KanbanCard> {
    const rows = this.storage.query(
      `SELECT session_id, id, content, status, scope, active_form, description FROM kanban_cards
       WHERE team_id = ? AND (session_id = ? OR session_id = ?)
       ORDER BY CAST(SUBSTR(id, 2) AS INTEGER)`,
      [teamId, TEAM_SESSION, sessionId],
    );
    return rows.map((row) => cardFromRow(row));
  }

  replace(teamId: string, sessionId: string, incoming: ReadonlyArray<KanbanCardWrite>): ReadonlyArray<KanbanCard> {
    const existing = this.load(teamId, sessionId);
    const merged = mergeIncoming(existing, incoming, (): string => this.nextCardId(teamId), sessionId);
    this.persist(teamId, sessionId, merged);
    return merged;
  }

  add(teamId: string, sessionId: string, content: string, description: string | undefined, scope: "team" | "session" = "team"): KanbanCard | null {
    const existing = this.load(teamId, sessionId);
    if (existing.some((card) => card.content === content)) return null;
    const card: KanbanCard = {
      id: this.nextCardId(teamId),
      content,
      status: "pending",
      scope,
      ...(description === undefined ? {} : { description }),
    };
    if (scope === "session") {
      (card as { sessionId?: string }).sessionId = sessionId;
    }
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

  setStatus(teamId: string, sessionId: string, cardId: string, status: KanbanStatus): boolean {
    const existing = this.load(teamId, sessionId);
    if (!existing.some((card) => card.id === cardId)) return false;
    this.persist(teamId, sessionId, existing.map((card) => (card.id === cardId ? { ...card, status } : card)));
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

  editDescription(teamId: string, sessionId: string, cardId: string, description: string | undefined): KanbanCard | null {
    const existing = this.load(teamId, sessionId);
    const index = existing.findIndex((card) => card.id === cardId);
    if (index === -1) return null;
    const card = { ...existing[index]! };
    if (description === undefined || description.trim() === "") {
      delete (card as { description?: string }).description;
    } else {
      card.description = description;
    }
    this.persist(teamId, sessionId, existing.map((c) => (c.id === cardId ? card : c)));
    return card;
  }

  private persist(teamId: string, sessionId: string, cards: ReadonlyArray<KanbanCard>): void {
    this.storage.transaction((s) => {
      s.exec(`DELETE FROM kanban_cards WHERE team_id = ? AND (session_id = ? OR session_id = ?)`, [teamId, TEAM_SESSION, sessionId]);
      for (let seq = 0; seq < cards.length; seq += 1) {
        const card = cards[seq]!;
        const cardSessionId = card.scope === "session" ? (card.sessionId ?? sessionId) : TEAM_SESSION;
        s.exec(
          `INSERT INTO kanban_cards (team_id, session_id, seq, id, content, status, scope, active_form, description, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [teamId, cardSessionId, seq, card.id, card.content, card.status, card.scope ?? "team", card.active_form ?? null, card.description ?? null, new Date().toISOString()],
        );
      }
    });
  }

  private nextCardId(teamId: string): string {
    const rows = this.storage.query(`SELECT next_id FROM kanban_counters WHERE team_id = ?`, [teamId]);
    const next = (rows[0]?.[0] as number | undefined) ?? 1;
    this.storage.exec(
      `INSERT INTO kanban_counters (team_id, next_id) VALUES (?, ?)
       ON CONFLICT(team_id) DO UPDATE SET next_id = excluded.next_id`,
      [teamId, next + 1],
    );
    return `#${next}`;
  }
}

function mergeIncoming(
  existing: ReadonlyArray<KanbanCard>,
  incoming: ReadonlyArray<KanbanCardWrite>,
  nextCardId: () => string,
  defaultSessionId: string,
): KanbanCard[] {
  const byContent = new Map(existing.map((card) => [card.content, card]));
  const writes = new Map<string, KanbanCardWrite>();
  for (const write of incoming) writes.set(write.content, write);
  return [...writes.values()].map((write) => {
    const prior = byContent.get(write.content);
    if (prior === undefined) {
      const scope = write.scope ?? "team";
      const card: KanbanCard = {
        id: nextCardId(),
        content: write.content,
        status: write.status,
        scope,
        ...(write.active_form === undefined ? {} : { active_form: write.active_form }),
        ...(write.description === undefined ? {} : { description: write.description }),
      };
      if (scope === "session") {
        (card as { sessionId?: string }).sessionId = defaultSessionId;
      }
      return card;
    }
    return {
      ...prior,
      status: write.status,
      ...(write.active_form === undefined ? {} : { active_form: write.active_form }),
      ...(write.description === undefined ? {} : { description: write.description }),
    };
  });
}

function cardFromRow(row: ReadonlyArray<unknown>): KanbanCard {
  const [sessionId, id, content, status, scope, activeForm, description] = row;
  const scopeValue = (scope as string) === "session" ? "session" : "team";
  const card: KanbanCard = {
    id: id as string,
    content: content as string,
    status: status as KanbanStatus,
    scope: scopeValue,
  };
  if (scopeValue === "session") {
    (card as { sessionId?: string }).sessionId = sessionId as string;
  }
  return { ...card, ...withOptional(activeForm, "active_form"), ...withOptional(description, "description") };
}

function withOptional(value: unknown, key: "active_form" | "description"): { [K in typeof key]?: string } {
  return value === null ? {} : { [key]: value as string };
}

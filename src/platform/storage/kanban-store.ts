import type { KanbanCard, KanbanCardPatch, KanbanCardWrite, KanbanStatus, KanbanTodo, KanbanTodoWrite } from "../types";
import { JiePlatformError } from "../jie-platform-errors";
import { expectNumber, expectString } from "./row-decode";
import type { SqlBinding, Storage } from "./storage";

const TEAM_SESSION = "";
const RETENTION_DAYS = 30;

type KanbanCardDraft = Omit<KanbanCard, "id"> & { id?: string };

export interface KanbanStore {
  load(teamId: string, sessionId: string): ReadonlyArray<KanbanCard>;
  replace(teamId: string, sessionId: string, incoming: ReadonlyArray<KanbanCardWrite>): ReadonlyArray<KanbanCard>;
  add(teamId: string, sessionId: string, content: string, description: string | undefined, scope?: "team" | "session"): KanbanCard | null;
  remove(teamId: string, sessionId: string, cardId: string): boolean;
  setStatus(teamId: string, sessionId: string, cardId: string, status: KanbanStatus): boolean;
  editContent(teamId: string, sessionId: string, cardId: string, content: string): KanbanCard | null;
  editDescription(teamId: string, sessionId: string, cardId: string, description: string | undefined): KanbanCard | null;
  handoff(teamId: string, sessionId: string, cardId: string, targetTeamId: string): KanbanCard | null;
  update(teamId: string, sessionId: string, content: string, patch: KanbanCardPatch): KanbanCard | null;
  claim(teamId: string, sessionId: string, content: string, agentKey: string, expectedStatus?: KanbanStatus): KanbanCard | null;
}

export class SqliteKanbanStore implements KanbanStore {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  load(teamId: string, sessionId: string): ReadonlyArray<KanbanCard> {
    return this.loadAll(teamId, sessionId).filter((card) => isVisible(card));
  }

  replace(teamId: string, sessionId: string, incoming: ReadonlyArray<KanbanCardWrite>): ReadonlyArray<KanbanCard> {
    const existing = this.loadAll(teamId, sessionId);
    const merged = mergeIncoming(existing, incoming, sessionId);
    const byContent = new Map(merged.map((card) => [card.content, card]));
    const cutoff = retentionCutoff();
    for (const card of existing) {
      if (!byContent.has(card.content) && card.status === "completed" && (card.completedAt === undefined || card.completedAt >= cutoff)) {
        merged.push(card);
      }
    }
    this.persist(teamId, sessionId, merged);
    return this.load(teamId, sessionId);
  }

  add(teamId: string, sessionId: string, content: string, description: string | undefined, scope: "team" | "session" = "team"): KanbanCard | null {
    const existing = this.loadAll(teamId, sessionId);
    if (existing.some((card) => card.content === content)) return null;
    const card: KanbanCardDraft = {
      content,
      status: "pending",
      scope,
      ...(scope === "session" ? { sessionId } : {}),
      ...(description === undefined ? {} : { description }),
    };
    this.persist(teamId, sessionId, [...existing, card]);
    return this.load(teamId, sessionId).find((c) => c.content === content) ?? null;
  }

  remove(teamId: string, sessionId: string, cardId: string): boolean {
    const existing = this.loadAll(teamId, sessionId);
    const next = existing.filter((card) => card.id !== cardId);
    if (next.length === existing.length) return false;
    this.persist(teamId, sessionId, next);
    return true;
  }

  setStatus(teamId: string, sessionId: string, cardId: string, status: KanbanStatus): boolean {
    const existing = this.loadAll(teamId, sessionId);
    const index = existing.findIndex((card) => card.id === cardId);
    if (index === -1) return false;
    const card = applyStatus(existing[index]!, status);
    this.persist(teamId, sessionId, existing.map((c) => (c.id === cardId ? card : c)));
    return true;
  }

  editContent(teamId: string, sessionId: string, cardId: string, content: string): KanbanCard | null {
    const existing = this.loadAll(teamId, sessionId);
    const index = existing.findIndex((card) => card.id === cardId);
    if (index === -1) return null;
    if (existing.some((card) => card.id !== cardId && card.content === content)) return null;
    const card = { ...existing[index]!, content };
    this.persist(teamId, sessionId, existing.map((c) => (c.id === cardId ? card : c)));
    return this.load(teamId, sessionId).find((c) => c.id === cardId) ?? card;
  }

  editDescription(teamId: string, sessionId: string, cardId: string, description: string | undefined): KanbanCard | null {
    const existing = this.loadAll(teamId, sessionId);
    const index = existing.findIndex((card) => card.id === cardId);
    if (index === -1) return null;
    const original = existing[index]!;
    const { description: _, ...base } = original;
    const card: KanbanCard = {
      ...base,
      ...(description === undefined || description.trim() === "" ? {} : { description }),
    };
    this.persist(teamId, sessionId, existing.map((c) => (c.id === cardId ? card : c)));
    return this.load(teamId, sessionId).find((c) => c.id === cardId) ?? card;
  }

  handoff(teamId: string, sessionId: string, cardId: string, targetTeamId: string): KanbanCard | null {
    const source = this.loadAll(teamId, sessionId);
    const index = source.findIndex((card) => card.id === cardId);
    if (index === -1) return null;
    const handoffCard = source[index]!;
    const { id: _, sessionId: __, ...targetBase } = handoffCard;
    const target = this.loadAll(targetTeamId, TEAM_SESSION);
    if (target.some((card) => card.content === handoffCard.content)) return null;
    const targetCard: KanbanCardDraft = {
      ...targetBase,
      scope: "team",
    };
    this.persist(teamId, sessionId, source.filter((card) => card.id !== cardId));
    this.persist(targetTeamId, TEAM_SESSION, [...target, targetCard]);
    return this.load(targetTeamId, TEAM_SESSION).find((c) => c.content === handoffCard.content) ?? null;
  }

  update(teamId: string, sessionId: string, content: string, patch: KanbanCardPatch): KanbanCard | null {
    const existing = this.loadAll(teamId, sessionId);
    const index = existing.findIndex((card) => card.content === content);
    if (index === -1) return null;
    const card = applyPatch(existing[index]!, patch);
    this.persist(teamId, sessionId, existing.map((c, i) => (i === index ? card : c)));
    return this.load(teamId, sessionId).find((c) => c.content === content) ?? card;
  }

  claim(teamId: string, sessionId: string, content: string, agentKey: string, expectedStatus?: KanbanStatus): KanbanCard | null {
    const existing = this.loadAll(teamId, sessionId);
    const index = existing.findIndex((card) => card.content === content);
    if (index === -1) return null;
    const card = existing[index]!;
    if (expectedStatus !== undefined && card.status !== expectedStatus) return null;
    if (card.assignee !== undefined && card.assignee !== "" && card.assignee !== agentKey) return null;
    const next: KanbanCard = {
      ...card,
      assignee: agentKey,
      ...(card.status === "pending" ? { status: "in_progress" } : {}),
    };
    this.persist(teamId, sessionId, existing.map((c, i) => (i === index ? next : c)));
    return this.load(teamId, sessionId).find((c) => c.content === content) ?? next;
  }

  private loadAll(teamId: string, sessionId: string): KanbanCard[] {
    const rows = this.storage.query(
      `SELECT session_id, id, content, status, scope, active_form, description, completed_at, external_ref, assignee, todos FROM kanban_tasks
       WHERE team_id = ? AND (session_id = ? OR session_id = ?)
       ORDER BY CAST(SUBSTR(id, 2) AS INTEGER)`,
      [teamId, TEAM_SESSION, sessionId],
    );
    return rows.map((row) => cardFromRow(row));
  }

  private persist(teamId: string, sessionId: string, cards: ReadonlyArray<KanbanCardDraft>): void {
    this.storage.transaction((s) => {
      s.exec(`DELETE FROM kanban_tasks WHERE team_id = ? AND (session_id = ? OR session_id = ?)`, [teamId, TEAM_SESSION, sessionId]);
      for (let seq = 0; seq < cards.length; seq += 1) {
        const card = cards[seq]!;
        const id = card.id ?? nextCardId(s, teamId);
        const cardSessionId = card.scope === "session" ? (card.sessionId ?? sessionId) : TEAM_SESSION;
        s.exec(
          `INSERT INTO kanban_tasks (team_id, session_id, seq, id, content, status, scope, active_form, description, completed_at, external_ref, assignee, todos, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            teamId, cardSessionId, seq, id, card.content, card.status,
            card.scope ?? "team", card.active_form ?? null, card.description ?? null,
            card.completedAt ?? null, card.externalRef ?? null, card.assignee ?? null,
            todosJson(card.todos),
            new Date().toISOString(),
          ],
        );
      }
    });
  }
}

function mergeIncoming(
  existing: ReadonlyArray<KanbanCard>,
  incoming: ReadonlyArray<KanbanCardWrite>,
  defaultSessionId: string,
): KanbanCardDraft[] {
  const byContent = new Map(existing.map((card) => [card.content, card]));
  const writes = new Map<string, KanbanCardWrite>();
  for (const write of incoming) writes.set(write.content, write);
  return [...writes.values()].map((write) => {
    const prior = byContent.get(write.content);
    const todos = mergeTodos(prior?.todos, write.todos);
    if (prior === undefined) {
      const scope = write.scope ?? "team";
      const card: KanbanCardDraft = {
        content: write.content,
        status: write.status,
        scope,
        ...(scope === "session" ? { sessionId: defaultSessionId } : {}),
        ...(write.active_form === undefined ? {} : { active_form: write.active_form }),
        ...(write.description === undefined ? {} : { description: write.description }),
        ...(write.externalRef === undefined ? {} : { externalRef: write.externalRef }),
        ...(write.assignee === undefined || write.assignee.trim() === "" ? {} : { assignee: write.assignee }),
        ...(todos === undefined ? {} : { todos }),
      };
      return applyStatus(card, write.status);
    }
    const { todos: _, ...priorBase } = prior;
    const card: KanbanCardDraft = {
      ...priorBase,
      status: write.status,
      ...(write.active_form === undefined ? {} : { active_form: write.active_form }),
      ...(write.description === undefined ? {} : { description: write.description }),
      ...(write.externalRef === undefined ? {} : { externalRef: write.externalRef }),
      ...(write.assignee === undefined ? {} : write.assignee.trim() === "" ? { assignee: undefined } : { assignee: write.assignee }),
      ...(todos === undefined ? {} : { todos }),
    };
    return applyStatus(card, write.status);
  });
}

function applyPatch(card: KanbanCard, patch: KanbanCardPatch): KanbanCard {
  let next: KanbanCard = { ...card };
  if (patch.status !== undefined) {
    if (patch.status === "completed") {
      next = { ...next, status: patch.status, completedAt: next.completedAt ?? new Date().toISOString() };
    } else {
      const { completedAt, ...rest } = next;
      next = { ...rest, status: patch.status };
    }
  }
  if (patch.active_form !== undefined) {
    const { active_form: _, ...base } = next;
    next = patch.active_form.trim() === "" ? { ...base } : { ...base, active_form: patch.active_form };
  }
  if (patch.description !== undefined) {
    const { description: _, ...base } = next;
    next = patch.description.trim() === "" ? { ...base } : { ...base, description: patch.description };
  }
  if (patch.externalRef !== undefined) {
    const { externalRef: _, ...base } = next;
    next = patch.externalRef.trim() === "" ? { ...base } : { ...base, externalRef: patch.externalRef };
  }
  if (patch.assignee !== undefined) {
    const { assignee: _, ...base } = next;
    next = patch.assignee.trim() === "" ? { ...base } : { ...base, assignee: patch.assignee };
  }
  if (patch.todos !== undefined) {
    const { todos: _, ...base } = next;
    const todos = mergeTodos(next.todos, patch.todos);
    next = { ...base, ...(todos === undefined ? {} : { todos }) };
  }
  return next;
}

function mergeTodos(
  prior: ReadonlyArray<KanbanTodo> | undefined,
  incoming: ReadonlyArray<KanbanTodoWrite> | undefined,
): ReadonlyArray<KanbanTodo> | undefined {
  if (incoming === undefined) return prior;
  validateTodos(incoming);
  const doneByText = new Map(prior?.map((todo) => [todo.text, todo.done]) ?? []);
  const todos = incoming.map((todo) => ({
    text: todo.text,
    done: todo.done ?? doneByText.get(todo.text) ?? false,
  }));
  return todos.length === 0 ? undefined : todos;
}

function validateTodos(todos: ReadonlyArray<KanbanTodoWrite>): void {
  const seen = new Set<string>();
  for (const todo of todos) {
    if (todo.text.trim() === "") {
      throw new JiePlatformError("KANBAN_WRITE_INVALID", { detail: "empty todo text" });
    }
    if (seen.has(todo.text)) {
      throw new JiePlatformError("KANBAN_WRITE_INVALID", { detail: `duplicate todo text: ${todo.text}` });
    }
    seen.add(todo.text);
  }
}

function applyStatus(card: KanbanCardDraft, status: KanbanStatus): KanbanCardDraft {
  if (status === "completed") {
    return { ...card, status, completedAt: card.completedAt ?? new Date().toISOString() };
  }
  const { completedAt, ...rest } = card;
  return { ...rest, status };
}

function isVisible(card: KanbanCard): boolean {
  if (card.status !== "completed") return true;
  if (card.completedAt === undefined) return true;
  return card.completedAt >= retentionCutoff();
}

function retentionCutoff(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - RETENTION_DAYS);
  return date.toISOString();
}

function cardFromRow(row: ReadonlyArray<SqlBinding>): KanbanCard {
  const [sessionId, id, content, status, scope, activeForm, description, completedAt, externalRef, assignee, todos] = row;
  const scopeValue = expectScope(scope);
  return {
    id: expectString(id),
    content: expectString(content),
    status: expectStatus(status),
    scope: scopeValue,
    ...(scopeValue === "session" ? { sessionId: expectString(sessionId) } : {}),
    ...(activeForm === null ? {} : { active_form: expectString(activeForm) }),
    ...(description === null ? {} : { description: expectString(description) }),
    ...(completedAt === null ? {} : { completedAt: expectString(completedAt) }),
    ...(externalRef === null ? {} : { externalRef: expectString(externalRef) }),
    ...(assignee === null || assignee === "" ? {} : { assignee: expectString(assignee) }),
    ...(todos === null ? {} : { todos: expectTodos(todos) }),
  };
}

function expectTodos(value: SqlBinding): ReadonlyArray<KanbanTodo> | undefined {
  const text = expectString(value);
  if (text === "") return undefined;
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error("expected todos array");
  if (parsed.length === 0) return undefined;
  return parsed.map((item) => {
    if (typeof item !== "object" || item === null) throw new Error("expected todo object");
    const record = item as Record<string, unknown>;
    const text = record.text;
    const done = record.done;
    if (typeof text !== "string" || typeof done !== "boolean") throw new Error("expected todo text and done");
    return { text, done };
  });
}

function todosJson(todos: ReadonlyArray<KanbanTodo> | undefined): string | null {
  if (todos === undefined || todos.length === 0) return null;
  return JSON.stringify(todos);
}

function expectStatus(value: SqlBinding): KanbanStatus {
  if (value === "pending" || value === "in_progress" || value === "in_review" || value === "completed") return value;
  throw new Error(`expected kanban status, got ${typeof value}`);
}

function expectScope(value: SqlBinding): "team" | "session" {
  if (value === "team" || value === "session") return value;
  return "team";
}

function nextCardId(s: Storage, teamId: string): string {
  const rows = s.query(`SELECT next_id FROM kanban_counters WHERE team_id = ?`, [teamId]);
  const next = rows.length === 0 ? 1 : expectNumber(rows[0]![0]);
  s.exec(
    `INSERT INTO kanban_counters (team_id, next_id) VALUES (?, ?)
     ON CONFLICT(team_id) DO UPDATE SET next_id = excluded.next_id`,
    [teamId, next + 1],
  );
  return `#${next}`;
}

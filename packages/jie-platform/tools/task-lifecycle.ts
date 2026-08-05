import type { ArtifactStore } from "../storage";
import type { TaskLifecycle, TaskTransitionRule } from "../types";
import { JiePlatformError } from "../jie-platform-errors";

const STATUS_SEQ_WIDTH = 4;

export interface TaskTransitionInput {
  readonly lifecycle: TaskLifecycle;
  readonly taskId: string;
  readonly topic: string;
  readonly agentRole: string;
}

export interface TaskTransitionOutcome {
  readonly phase: string;
  readonly iteration: number;
}

export interface TaskLifecycleGuard {
  applyTransition(input: TaskTransitionInput): Promise<TaskTransitionOutcome>;
}

export function createTaskLifecycleGuard(artifactStore: ArtifactStore): TaskLifecycleGuard {
  const statusRows = createPerTaskQueue();
  return {
    async applyTransition(input: TaskTransitionInput): Promise<TaskTransitionOutcome> {
      const candidates = resolveRules(input.lifecycle.transitions, input.topic, input.agentRole);
      if (candidates.length === 0) {
        throw new JiePlatformError("ILLEGAL_TRANSITION", {
          detail: `no transition on topic '${input.topic}' allows role '${input.agentRole}'`,
        });
      }
      return statusRows.run(input.taskId, async () => {
        const rows = await artifactStore.list(statusPrefix(input.taskId));
        const state = await readCurrentState(artifactStore, rows);
        const currentPhase = state === null ? null : state.phase;
        if (currentPhase !== null && input.lifecycle.permanentPhases.includes(currentPhase)) {
          throw new JiePlatformError("ILLEGAL_TRANSITION", {
            detail: `task '${input.taskId}' is in permanent phase '${currentPhase}'`,
          });
        }
        const rule = candidates.find((candidate) => fromMatches(candidate, currentPhase));
        if (rule === undefined) {
          const expected = candidates.flatMap((candidate) => fromPhasesAsList(candidate));
          throw new JiePlatformError("ILLEGAL_TRANSITION", {
            detail: currentPhase === null
              ? `task '${input.taskId}' has no phase yet; topic '${input.topic}' requires one of: ${expected.join(", ")}`
              : `task '${input.taskId}' is in phase '${currentPhase}', but topic '${input.topic}' requires one of: ${expected.join(", ")}`,
          });
        }
        const iteration = nextIteration(rule, state, input.lifecycle.maxIterations, input.taskId);
        const content = JSON.stringify({ phase: rule.toPhase, iteration, updated_at: new Date().toISOString() });
        await artifactStore.write(statusSeqKey(input.taskId, rows.length + 1), content);
        return { phase: rule.toPhase, iteration };
      });
    },
  };
}

interface TaskPhaseState {
  readonly phase: string;
  readonly iteration: number;
}

interface StatusRow {
  readonly key: string;
  readonly created_at: string;
}

function resolveRules(
  transitions: ReadonlyArray<TaskTransitionRule>,
  topic: string,
  agentRole: string,
): ReadonlyArray<TaskTransitionRule> {
  const exact: TaskTransitionRule[] = [];
  const wildcard: TaskTransitionRule[] = [];
  for (const rule of transitions) {
    if (rule.topic !== topic) continue;
    if (rule.role === agentRole) exact.push(rule);
    else if (rule.role === "any") wildcard.push(rule);
  }
  return exact.length > 0 ? exact : wildcard;
}

function fromMatches(rule: TaskTransitionRule, currentPhase: string | null): boolean {
  if (rule.fromPhases === "any") return true;
  return currentPhase !== null && rule.fromPhases.includes(currentPhase);
}

function fromPhasesAsList(rule: TaskTransitionRule): ReadonlyArray<string> {
  return rule.fromPhases === "any" ? ["any"] : rule.fromPhases;
}

function statusPrefix(taskId: string): string {
  return `${taskId}/status/`;
}

function statusSeqKey(taskId: string, seq: number): string {
  return `${taskId}/status/${String(seq).padStart(STATUS_SEQ_WIDTH, "0")}`;
}

async function readCurrentState(
  artifactStore: ArtifactStore,
  rows: ReadonlyArray<StatusRow>,
): Promise<TaskPhaseState | null> {
  const newest = newestStatusRow(rows);
  if (newest === null) return null;
  const row = await artifactStore.read(newest.key);
  if (row === null) return null;
  return parseStatusRow(row.content);
}

function newestStatusRow(rows: ReadonlyArray<StatusRow>): StatusRow | null {
  let newest: StatusRow | null = null;
  for (const row of rows) {
    const isNewer = newest === null
      || row.created_at > newest.created_at
      || (row.created_at === newest.created_at && row.key > newest.key);
    if (isNewer) newest = row;
  }
  return newest;
}

function parseStatusRow(content: string): TaskPhaseState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const row = parsed as Record<string, unknown>;
  if (typeof row.phase !== "string") return null;
  if (typeof row.iteration !== "number" || !Number.isInteger(row.iteration) || row.iteration < 1) return null;
  return { phase: row.phase, iteration: row.iteration };
}

function nextIteration(
  rule: TaskTransitionRule,
  state: TaskPhaseState | null,
  maxIterations: number,
  taskId: string,
): number {
  const current = state === null ? 0 : state.iteration;
  if (rule.iteration === "reset") return 1;
  if (rule.iteration === "increment") {
    const next = current + 1;
    if (next > maxIterations) {
      throw new JiePlatformError("ILLEGAL_TRANSITION", {
        detail: `task '${taskId}': iteration ${next} would exceed max_iterations ${maxIterations}`,
      });
    }
    return next;
  }
  return current === 0 ? 1 : current;
}

interface PerTaskQueue {
  run<T>(taskId: string, operation: () => Promise<T>): Promise<T>;
}

function createPerTaskQueue(): PerTaskQueue {
  const queues = new Map<string, Promise<void>>();
  return {
    async run<T>(taskId: string, operation: () => Promise<T>): Promise<T> {
      const currentQueue = queues.get(taskId) ?? Promise.resolve();
      let releaseNext!: () => void;
      const nextQueue = new Promise<void>((resolve) => {
        releaseNext = resolve;
      });
      const chainedQueue = currentQueue.then(() => nextQueue);
      queues.set(taskId, chainedQueue);
      await currentQueue;
      try {
        return await operation();
      } finally {
        releaseNext();
        if (queues.get(taskId) === chainedQueue) queues.delete(taskId);
      }
    },
  };
}

import { truncateToWidth } from "@earendil-works/pi-tui";
import { TuiState, type StateStore } from "../../state";
import { type TuiComponent } from "../..";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, WORKING_LABEL, style } from "../themes";

const TEAM_WORKING_LABEL = "Team working…";
const TEAM_SPINNER_INTERVAL_MS = 1000;
const INTERRUPTED_LABEL = "Interrupted";

type WorkingMode = ReturnType<typeof TuiState.workingKind> | "interrupted";

export class WorkingSpinner implements TuiComponent {
  private readonly stateStore: StateStore;
  private mode: WorkingMode = "none";

  constructor(stateStore: StateStore) { this.stateStore = stateStore; }

  update(): boolean {
    const mode = workingMode(this.stateStore.getState());
    if (mode === this.mode) return false;
    this.mode = mode;
    return true;
  }

  render(_width: number): string[] {
    const mode = workingMode(this.stateStore.getState());
    if (mode === "none") return [];
    if (mode === "interrupted") return ["", style("muted")(INTERRUPTED_LABEL)];
    const label = mode === "team" ? TEAM_WORKING_LABEL : WORKING_LABEL;
    const startedAt = workingStartedAt(this.stateStore.getState(), mode);
    const elapsed = startedAt !== null
      ? ` (${Math.floor(Math.max(0, Date.now() - startedAt) / 1000)}s)`
      : "";
    const intervalMs = mode === "team" ? TEAM_SPINNER_INTERVAL_MS : SPINNER_INTERVAL_MS;
    const statusLine = `${style("accent")(spinnerFrame(Date.now(), intervalMs))} ${style("muted")(label + elapsed)}`;
    return ["", truncateToWidth(statusLine, Math.max(1, _width), "", false)];
  }

  invalidate(): void {}
}

function workingMode(state: TuiState): WorkingMode {
  const kind = TuiState.workingKind(state);
  if (kind === "none" && TuiState.isInterrupted(state)) return "interrupted";
  return kind;
}

function workingStartedAt(state: TuiState, mode: WorkingMode): number | null {
  if (mode === "focused") {
    const focused = TuiState.getFocusedAgent(state);
    return focused?.workStartedAt ?? null;
  }
  let min: number | null = null;
  for (const agent of state.agents.values()) {
    if (agent.status !== "busy" || agent.workStartedAt === null) continue;
    if (min === null || agent.workStartedAt < min) min = agent.workStartedAt;
  }
  return min;
}

function spinnerFrame(now: number, intervalMs: number): string {
  return SPINNER_FRAMES[Math.floor(now / intervalMs) % SPINNER_FRAMES.length] ?? SPINNER_FRAMES[0];
}

export { spinnerFrame as _spinnerFrame };

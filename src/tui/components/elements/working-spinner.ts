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
  private startedAt: number | null = null;

  constructor(stateStore: StateStore) { this.stateStore = stateStore; }

  update(): boolean {
    const mode = workingMode(this.stateStore.getState());
    if (mode === "none") this.startedAt = null;
    else if (this.startedAt === null) this.startedAt = Date.now();
    if (mode === this.mode) return false;
    this.mode = mode;
    return true;
  }

  render(_width: number): string[] {
    const mode = workingMode(this.stateStore.getState());
    if (mode === "none") return [];
    if (mode !== "interrupted" && this.startedAt === null) this.startedAt = Date.now();
    if (mode === "interrupted") return ["", style("muted")(INTERRUPTED_LABEL)];
    const label = mode === "team" ? TEAM_WORKING_LABEL : WORKING_LABEL;
    const elapsed = this.startedAt !== null ? ` (${Math.floor(Math.max(0, Date.now() - this.startedAt) / 1000)}s)` : "";
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

function spinnerFrame(now: number, intervalMs: number): string {
  return SPINNER_FRAMES[Math.floor(now / intervalMs) % SPINNER_FRAMES.length] ?? SPINNER_FRAMES[0];
}

export { spinnerFrame as _spinnerFrame };

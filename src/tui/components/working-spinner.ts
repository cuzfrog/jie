import { Container, Loader, type TUI } from "@earendil-works/pi-tui";
import { TuiState, type StateStore } from "../state";
import { type TuiComponent } from "..";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, WORKING_LABEL, style } from "./themes";

export interface WorkingSpinner extends TuiComponent {
  stop(): void;
}

const TEAM_WORKING_LABEL = "Team working…";
const TEAM_SPINNER_INTERVAL_MS = 1000;
const INTERRUPTED_LABEL = "Interrupted";
const NO_SPINNER_FRAMES: string[] = [];

export class WorkingSpinnerImpl implements WorkingSpinner {
  private readonly stateStore: StateStore;
  private readonly slot: Container;
  private readonly workingIndicator: Loader;
  private readonly teamWorkingIndicator: Loader;
  private readonly interruptedIndicator: Loader;

  constructor(screen: TUI, stateStore: StateStore) {
    this.stateStore = stateStore;
    this.slot = new Container();
    this.workingIndicator = new FlushLoader(screen, style("accent"), style("muted"), WORKING_LABEL, {
      frames: [...SPINNER_FRAMES], intervalMs: SPINNER_INTERVAL_MS,
    });
    this.teamWorkingIndicator = new FlushLoader(screen, style("accent"), style("muted"), TEAM_WORKING_LABEL, {
      frames: [...SPINNER_FRAMES], intervalMs: TEAM_SPINNER_INTERVAL_MS,
    });
    this.interruptedIndicator = new FlushLoader(screen, style("muted"), style("muted"), INTERRUPTED_LABEL, {
      frames: NO_SPINNER_FRAMES,
    });
  }

  render(width: number): string[] {
    return this.slot.render(width);
  }

  invalidate(): void {
    this.slot.invalidate();
  }

  update(): boolean {
    return this.sync();
  }

  stop(): void {
    this.workingIndicator.stop();
    this.teamWorkingIndicator.stop();
  }

  private sync(): boolean {
    const state = this.stateStore.getState();
    const kind = TuiState.workingKind(state);
    const mode = kind === "none" && TuiState.isInterrupted(state) ? "interrupted" : kind;
    return syncWorkingSlot(this.slot, this.workingIndicator, this.teamWorkingIndicator, this.interruptedIndicator, mode);
  }
}

type WorkingSlotMode = ReturnType<typeof TuiState.workingKind> | "interrupted";

class FlushLoader extends Loader {
  render(width: number): string[] {
    return super.render(width).map((line) => (line.startsWith(" ") ? line.slice(1) : line));
  }
}

function syncWorkingSlot(slot: Container, working: Loader, teamWorking: Loader, interrupted: Loader, mode: WorkingSlotMode): boolean {
  const target = mode === "focused" ? working : mode === "team" ? teamWorking : mode === "interrupted" ? interrupted : null;
  const current = slot.children[0] ?? null;
  if (current === target) return false;
  if (current === working) working.stop();
  if (current === teamWorking) teamWorking.stop();
  slot.clear();
  if (target === null) return true;
  slot.addChild(target);
  if (mode === "focused" || mode === "team") target.start();
  return true;
}

export { FlushLoader as _FlushLoader, syncWorkingSlot as _syncWorkingSlot };

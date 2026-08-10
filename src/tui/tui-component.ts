import type { Component } from "@earendil-works/pi-tui";
import type { Action, TuiState } from "./state";

export interface TuiComponent extends Component {
  /** Reconcile to current state; return true when a re-render is needed. */
  update(): boolean;
  resolveKey?(data: string, state: TuiState, popupOpen: boolean): Action | null;
}

export interface TuiRoot {
  /** Reconcile the component tree; return true when a re-render is needed. */
  update(): boolean;
}

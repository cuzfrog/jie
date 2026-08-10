import type { Component } from "@earendil-works/pi-tui";

export interface TuiComponent extends Component {
  /** Reconcile to current state; return true when a re-render is needed. */
  update(): boolean;
}

export interface TuiRoot {
  /** Reconcile the component tree; return true when a re-render is needed. */
  update(): boolean;
}

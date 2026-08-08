import { truncateToWidth } from "@earendil-works/pi-tui";
import { type StateStore, type TuiState } from "../../state";
import { helpLines } from "../elements";
import { Panel } from "./panel";
import { style } from "../themes";

const HINT = "Type /help to close.";

export class HelpPanel extends Panel {
  constructor(stateStore: StateStore) {
    super(stateStore);
  }

  protected isVisible(state: TuiState): boolean {
    return state.helpPanelVisible;
  }

  protected body(_state: TuiState, inner: number): string[] {
    return helpLines(inner);
  }

  protected hint(_state: TuiState, width: number): string | null {
    return truncateToWidth(style("dim")(HINT), width);
  }
}

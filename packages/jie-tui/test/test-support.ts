import { TUI } from "@earendil-works/pi-tui";
import { VirtualTerminal } from "./virtual-terminal";

export function createTestTui(cols = 80, rows = 24): TUI {
  return new TUI(new VirtualTerminal(cols, rows));
}

export interface TestTuiWithTerminal {
  tui: TUI;
  terminal: VirtualTerminal;
}

export function createTestTuiWithTerminal(cols = 80, rows = 24): TestTuiWithTerminal {
  const terminal = new VirtualTerminal(cols, rows);
  const tui = new TUI(terminal);
  return { tui, terminal };
}

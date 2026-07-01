import { TUI } from "@earendil-works/pi-tui";
import { VirtualTerminal } from "./virtual-terminal";

export interface TestTuiWithTerminal {
  tui: TUI;
  terminal: VirtualTerminal;
}

export function createTestTuiWithTerminal(cols = 80, rows = 24): TestTuiWithTerminal {
  const terminal = new VirtualTerminal(cols, rows);
  const tui = new TUI(terminal);
  return { tui, terminal };
}

export const withTTY = (value: boolean, action: () => void): void => {
  const original = process.stdin.isTTY;
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
  try {
    action();
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: original, configurable: true });
  }
};

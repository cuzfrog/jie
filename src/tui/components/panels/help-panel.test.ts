import { visibleWidth } from "@earendil-works/pi-tui";
import type { CommandRegistry } from "../../command";
import { SLASH_COMMANDS } from "../../command/definitions";
import { type StateStore } from "../../state";
import { makeTuiState } from "../../test";
import { HelpPanel, _helpLines } from "./help-panel";
import { style } from "../themes";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

function makeCommandRegistry(): CommandRegistry {
  const aliasToCanonical = new Map<string, string>();
  for (const command of SLASH_COMMANDS) {
    for (const alias of command.meta.aliases ?? []) {
      aliasToCanonical.set(alias, command.meta.name);
    }
  }
  return vi.mocked<CommandRegistry>({
    commands: SLASH_COMMANDS,
    metadata: SLASH_COMMANDS.map((command) => command.meta),
    resolveCommandName: vi.fn((name) => aliasToCanonical.get(name) ?? name),
  });
}

describe("HelpPanel", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders nothing while the panel is hidden", () => {
    expect(new HelpPanel(stateStore, makeCommandRegistry()).render(80)).toEqual([]);
  });

  test("renders a boxed help panel when visible", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ helpPanelVisible: true }));
    const lines = new HelpPanel(stateStore, makeCommandRegistry()).render(80);
    expect(lines[0]).toBe(style("borderMuted")(`┌${"─".repeat(78)}┐`));
    expect(lines[lines.length - 2]).toBe(style("borderMuted")(`└${"─".repeat(78)}┘`));
    const text = lines.map(stripAnsi).join("\n");
    expect(text).toContain("Commands");
    expect(text).toContain("Shortcuts");
    expect(text).toContain("/resume");
  });

  test("renders the close hint below the box", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ helpPanelVisible: true }));
    const lines = new HelpPanel(stateStore, makeCommandRegistry()).render(80);
    expect(lines[lines.length - 1]).toBe(style("dim")("Type /help to close."));
    expect(stripAnsi(lines[lines.length - 2])).toBe(`└${"─".repeat(78)}┘`);
  });

  test("omits the mark, identity and team roster from the help content", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ helpPanelVisible: true, teamId: "my-team" }));
    const text = new HelpPanel(stateStore, makeCommandRegistry()).render(80).map(stripAnsi).join("\n");
    expect(text).not.toContain("█");
    expect(text).not.toContain("(jiè)");
    expect(text).not.toContain("Teams:");
  });

  test("toggling /help closes the panel", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ helpPanelVisible: true }));
    const open = new HelpPanel(stateStore, makeCommandRegistry()).render(80);
    expect(open.length).toBeGreaterThan(0);
    stateStore.getState.mockReturnValue(makeTuiState({ helpPanelVisible: false }));
    expect(new HelpPanel(stateStore, makeCommandRegistry()).render(80)).toEqual([]);
  });

  test("every rendered line fits the given width", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ helpPanelVisible: true }));
    const panel = new HelpPanel(stateStore, makeCommandRegistry());
    for (const width of [13, 40, 60, 80, 139]) {
      for (const line of panel.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe("HelpPanel.update", () => {
  test("reports dirty when the panel becomes visible", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ helpPanelVisible: false }));
    const panel = new HelpPanel(stateStore, makeCommandRegistry());
    panel.update();
    stateStore.getState.mockReturnValue(makeTuiState({ helpPanelVisible: true }));
    expect(panel.update()).toBe(true);
  });

  test("reports dirty when the panel becomes hidden", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ helpPanelVisible: true }));
    const panel = new HelpPanel(stateStore, makeCommandRegistry());
    panel.update();
    stateStore.getState.mockReturnValue(makeTuiState({ helpPanelVisible: false }));
    expect(panel.update()).toBe(true);
  });

  test("reports clean when the visibility is unchanged", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ helpPanelVisible: true }));
    const panel = new HelpPanel(stateStore, makeCommandRegistry());
    expect(panel.update()).toBe(true);
    expect(panel.update()).toBe(false);
  });

  test("reports clean when only an unwatched field changes", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ helpPanelVisible: true }));
    const panel = new HelpPanel(stateStore, makeCommandRegistry());
    panel.update();
    stateStore.getState.mockReturnValue(makeTuiState({ helpPanelVisible: true, kanbanView: "list" }));
    expect(panel.update()).toBe(false);
  });
});

describe("_helpLines", () => {
  test("renders Commands and Shortcuts without the mark or identity", () => {
    const text = _helpLines(80, makeCommandRegistry().metadata).map(stripAnsi).join("\n");
    expect(text).toContain("Commands");
    expect(text).toContain("Shortcuts");
    expect(text).not.toContain("█");
    expect(text).not.toContain("(jiè)");
    expect(text).not.toContain("Teams:");
    expect(text).not.toContain("general-1");
  });

  test("every line fits the given width", () => {
    for (const width of [13, 40, 60, 80, 139]) {
      for (const line of _helpLines(width, makeCommandRegistry().metadata)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

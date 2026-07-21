import { Editor, type EditorTheme, type TUI } from "@earendil-works/pi-tui";
import { Actions, type StateStore } from "../../state";
import { createJieAutocompleteProvider } from "../../autocomplete";
import { style } from "../themes";

const ESCAPE = "\x1b";
const CTRL_C = "\x03";
const CTRL_D = "\x04";

const editorTheme: EditorTheme = {
  borderColor: style("border"),
  selectList: {
    selectedPrefix: style("accent"),
    selectedText: style("text"),
    description: style("muted"),
    scrollInfo: style("muted"),
    noMatch: style("muted"),
  },
};

export function createJieEditor(tui: TUI, stateStore: StateStore, cwd: string): Editor {
  const editor = new JieEditor(tui, stateStore, editorTheme);
  editor.setAutocompleteProvider(createJieAutocompleteProvider(cwd));
  editor.onChange = (text: string): void => {
    editor.borderColor = text.startsWith("!") ? style("warning") : style("border");
    stateStore.dispatch(Actions.setEditorText(text));
    if (stateStore.getState().errorBanner !== null && text.length > 0) {
      stateStore.dispatch(Actions.clearBanners());
    }
  };
  editor.onSubmit = (text: string): void => {
    if (text !== "") editor.addToHistory(text);
    stateStore.dispatch(Actions.submitEditorText(text));
  };
  return editor;
}

class JieEditor extends Editor {
  private readonly stateStore: StateStore;

  constructor(tui: TUI, stateStore: StateStore, theme: EditorTheme) {
    super(tui, theme);
    this.stateStore = stateStore;
  }

  handleInput(data: string): void {
    if (data === ESCAPE) {
      if (!this.isShowingAutocomplete()) this.interruptFocusedAgent();
      return;
    }
    if (data === CTRL_C) {
      this.clearOrQuit();
      return;
    }
    if (data === CTRL_D && this.getText() === "") {
      this.stateStore.dispatch(Actions.requestQuit());
      return;
    }
    super.handleInput(data);
  }

  private interruptFocusedAgent(): void {
    const state = this.stateStore.getState();
    if (state.teamId === null || state.focusedAgentId === null) return;
    const focused = state.agents.get(state.focusedAgentId);
    if (focused === undefined || focused.status !== "busy") return;
    this.stateStore.dispatch(Actions.requestInterrupt(focused.teamId, focused.agentKey));
  }

  private clearOrQuit(): void {
    if (this.getText() !== "") {
      this.setText("");
      return;
    }
    this.stateStore.dispatch(Actions.requestQuit());
  }
}

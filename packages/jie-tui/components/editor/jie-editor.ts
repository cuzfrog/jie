import { Editor, type AutocompleteProvider, type EditorTheme, type TUI } from "@earendil-works/pi-tui";
import { Actions, type StateStore } from "../../state";
import { style } from "../themes";

const ESCAPE = "\x1b";
const CTRL_C = "\x03";
const CTRL_D = "\x04";

const EDITOR_THEME: EditorTheme = {
  borderColor: style("border"),
  selectList: {
    selectedPrefix: style("accent"),
    selectedText: style("text"),
    description: style("muted"),
    scrollInfo: style("muted"),
    noMatch: style("muted"),
  },
};

export class JieEditor extends Editor {
  private readonly stateStore: StateStore;

  constructor(tui: TUI, stateStore: StateStore, autocompleteProvider: AutocompleteProvider, theme: EditorTheme = EDITOR_THEME) {
    super(tui, theme);
    this.stateStore = stateStore;
    this.setAutocompleteProvider(autocompleteProvider);
    this.onChange = (text: string): void => {
      this.borderColor = text.startsWith("!") ? style("warning") : style("border");
      this.stateStore.dispatch(Actions.setEditorText(text));
      if (this.stateStore.getState().errorBanner !== null && text.length > 0) {
        this.stateStore.dispatch(Actions.clearBanners());
      }
    };
    this.onSubmit = (text: string): void => {
      if (text !== "") this.addToHistory(text);
      this.stateStore.dispatch(Actions.submitEditorText(text));
    };
  }

  handleInput(data: string): void {
    if (data === ESCAPE) {
      if (this.isShowingAutocomplete()) {
        super.handleInput(data);
        return;
      }
      this.interruptFocusedAgent();
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

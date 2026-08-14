import type { QuestionItem } from "../../../platform";
import { Actions } from "../../state";
import { type StateStore, type TuiState } from "../../state";
import { makeTuiState } from "../../test";
import { QuestionPanel } from "./question-panel";

const QUESTIONS: QuestionItem[] = [
  {
    question: "Which approach?",
    header: "Approach",
    options: [
      { label: "A", description: "approach a" },
      { label: "B", description: "approach b" },
    ],
    multiSelect: false,
  },
  {
    question: "Include tests?",
    header: "Tests",
    options: [
      { label: "yes", description: "yes" },
      { label: "no", description: "no" },
    ],
    multiSelect: true,
  },
];

function makeQuestionState(overrides: Partial<NonNullable<TuiState["question"]>> = {}): NonNullable<TuiState["question"]> {
  const q: NonNullable<TuiState["question"]> = {
    requestId: "req-1",
    agentId: "t1:a1",
    questions: QUESTIONS,
    questionIndex: 0,
    optionCursor: 0,
    selections: QUESTIONS.map(() => []),
    otherText: QUESTIONS.map(() => null),
    editingOther: false,
  };
  return { ...q, ...overrides };
}

function makeStateStore(state: TuiState) {
  return vi.mocked<StateStore>({ getState: vi.fn(() => state), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });
}

function questionPanel(state: TuiState): QuestionPanel {
  return new QuestionPanel(makeStateStore(state));
}

describe("QuestionPanel", () => {
  test("is not visible when there is no active question", () => {
    const panel = questionPanel(makeTuiState());
    expect(panel.update()).toBe(false);
    expect(panel.render(80)).toEqual([]);
  });

  test("update returns true when a question appears", () => {
    const stateStore = makeStateStore(makeTuiState());
    const panel = new QuestionPanel(stateStore);
    panel.update();
    stateStore.getState.mockReturnValue(makeTuiState({ question: makeQuestionState() }));
    expect(panel.update()).toBe(true);
  });

  test("update returns false when the question is unchanged", () => {
    const panel = questionPanel(makeTuiState({ question: makeQuestionState() }));
    panel.update();
    expect(panel.update()).toBe(false);
  });

  test("renders the question, options, and Other row", () => {
    const panel = questionPanel(makeTuiState({ question: makeQuestionState() }));
    panel.update();
    const lines = panel.render(40).map((line) => stripAnsi(line));
    const text = lines.join("\n");
    expect(text).toContain("Approach · 1/2");
    expect(text).toContain("Which approach?");
    expect(text).toContain("A");
    expect(text).toContain("approach a");
    expect(text).toContain("Other");
  });

  test("up and down dispatch moveQuestionCursor", () => {
    const stateStore = makeStateStore(makeTuiState({ question: makeQuestionState() }));
    const panel = new QuestionPanel(stateStore);
    panel.update();
    panel.handleInput("\x1b[B");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.moveQuestionCursor("down"));
    panel.handleInput("\x1b[A");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.moveQuestionCursor("up"));
  });

  test("space on a real option dispatches toggleQuestionOption", () => {
    const stateStore = makeStateStore(makeTuiState({ question: makeQuestionState() }));
    const panel = new QuestionPanel(stateStore);
    panel.update();
    panel.handleInput(" ");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.toggleQuestionOption(0));
  });

  test("space on Other starts editing when otherText is empty", () => {
    const stateStore = makeStateStore(makeTuiState({ question: makeQuestionState({ optionCursor: 2 }) }));
    const panel = new QuestionPanel(stateStore);
    panel.update();
    panel.handleInput(" ");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.startQuestionOtherEdit());
  });

  test("enter on a single-select option selects and advances", () => {
    const stateStore = makeStateStore(makeTuiState({ question: makeQuestionState({ optionCursor: 1 }) }));
    const panel = new QuestionPanel(stateStore);
    panel.update();
    panel.handleInput("\r");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.selectQuestionOptionAndAdvance(1));
  });

  test("enter on the last question submits answers", () => {
    const stateStore = makeStateStore(makeTuiState({ question: makeQuestionState({ questionIndex: 1, selections: [[1], [0]], otherText: [null, null] }) }));
    const panel = new QuestionPanel(stateStore);
    panel.update();
    panel.handleInput("\r");
    expect(stateStore.dispatch).toHaveBeenCalledWith(
      Actions.submitQuestionAnswers("req-1", [
        { header: "Approach", selected: ["B"], other: null },
        { header: "Tests", selected: ["yes"], other: null },
      ]),
    );
  });

  test("escape dispatches cancelQuestion", () => {
    const stateStore = makeStateStore(makeTuiState({ question: makeQuestionState() }));
    const panel = new QuestionPanel(stateStore);
    panel.update();
    panel.handleInput("\x1b");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.cancelQuestion("req-1"));
  });

  test("ctrl+c and ctrl+d dispatch cancelQuestion", () => {
    const stateStore = makeStateStore(makeTuiState({ question: makeQuestionState() }));
    const panel = new QuestionPanel(stateStore);
    panel.update();
    panel.handleInput("\x03");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.cancelQuestion("req-1"));
    stateStore.dispatch.mockClear();
    panel.handleInput("\x04");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.cancelQuestion("req-1"));
  });

  test("typing while editing Other dispatches confirmQuestionOther on enter", () => {
    const stateStore = makeStateStore(makeTuiState({ question: makeQuestionState({ editingOther: true, optionCursor: 2 }) }));
    const panel = new QuestionPanel(stateStore);
    panel.update();
    panel.handleInput("x");
    panel.handleInput("\r");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.confirmQuestionOther("x"));
  });

  test("escape while editing Other dispatches stopQuestionOtherEdit", () => {
    const stateStore = makeStateStore(makeTuiState({ question: makeQuestionState({ editingOther: true }) }));
    const panel = new QuestionPanel(stateStore);
    panel.update();
    panel.handleInput("\x1b");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.stopQuestionOtherEdit());
  });

  test("cancel shortcut while editing Other dispatches cancelQuestion", () => {
    const stateStore = makeStateStore(makeTuiState({ question: makeQuestionState({ editingOther: true }) }));
    const panel = new QuestionPanel(stateStore);
    panel.update();
    panel.handleInput("\x03");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.cancelQuestion("req-1"));
  });

  test("submitAnswers includes Other text and label", () => {
    const stateStore = makeStateStore(makeTuiState({
      question: makeQuestionState({
        questionIndex: 1,
        selections: [[0], []],
        otherText: [null, "only for new files"],
      }),
    }));
    const panel = new QuestionPanel(stateStore);
    panel.update();
    panel.handleInput("\r");
    expect(stateStore.dispatch).toHaveBeenCalledWith(
      Actions.submitQuestionAnswers("req-1", [
        { header: "Approach", selected: ["A"], other: null },
        { header: "Tests", selected: ["Other"], other: "only for new files" },
      ]),
    );
  });
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

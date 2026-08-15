import type { QuestionItem } from "../../platform";
import { Actions } from "./actions";
import { makeTuiState } from "../test";
import type { TuiState } from "./state";
import { reduceQuestionAction } from "./question-reducer";

type QuestionState = NonNullable<TuiState["question"]>;

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

function makeQuestionState(overrides: Partial<QuestionState> = {}): QuestionState {
  return {
    requestId: "req-1",
    agentId: "t1:a1",
    questions: QUESTIONS,
    questionIndex: 0,
    optionCursor: 0,
    selections: QUESTIONS.map(() => []),
    otherText: QUESTIONS.map(() => null),
    editingOther: false,
    ...overrides,
  };
}

describe("reduceQuestionAction", () => {
  test("SHOW_QUESTIONS creates question state and closes other panels", () => {
    const state = makeTuiState({ teamPanelVisible: true, helpPanelVisible: true });
    const next = reduceQuestionAction(state, Actions.showQuestions("req-1", "t1:a1", QUESTIONS));
    expect(next.question).toEqual(makeQuestionState());
    expect(next.teamPanelVisible).toBe(false);
    expect(next.helpPanelVisible).toBe(false);
  });

  test("MOVE_QUESTION_CURSOR wraps up and down", () => {
    const state = makeTuiState({ question: makeQuestionState({ otherText: ["existing", null] }) });
    const down = reduceQuestionAction(state, Actions.moveQuestionCursor("down"));
    expect(down.question?.optionCursor).toBe(1);
    const down2 = reduceQuestionAction(down, Actions.moveQuestionCursor("down"));
    expect(down2.question?.optionCursor).toBe(2); // Other
    const down3 = reduceQuestionAction(down2, Actions.moveQuestionCursor("down"));
    expect(down3.question?.optionCursor).toBe(0);
    const up = reduceQuestionAction(down2, Actions.moveQuestionCursor("up"));
    expect(up.question?.optionCursor).toBe(1);
  });

  test("MOVE_QUESTION_CURSOR to Other starts editing when Other has no text", () => {
    const state = makeTuiState({ question: makeQuestionState() });
    const next = reduceQuestionAction(state, Actions.moveQuestionCursor("down"));
    const next2 = reduceQuestionAction(next, Actions.moveQuestionCursor("down"));
    expect(next2.question?.optionCursor).toBe(2);
    expect(next2.question?.editingOther).toBe(true);
  });

  test("MOVE_QUESTION_CURSOR is a no-op while editing Other", () => {
    const state = makeTuiState({ question: makeQuestionState({ editingOther: true, optionCursor: 2 }) });
    const next = reduceQuestionAction(state, Actions.moveQuestionCursor("down"));
    expect(next.question?.optionCursor).toBe(2);
  });

  test("SELECT_QUESTION_OPTION_AND_ADVANCE selects an option and advances", () => {
    const state = makeTuiState({ question: makeQuestionState() });
    const next = reduceQuestionAction(state, Actions.selectQuestionOptionAndAdvance(1));
    expect(next.question?.questionIndex).toBe(1);
    expect(next.question?.selections[0]).toEqual([1]);
    expect(next.question?.otherText[0]).toBeNull();
  });

  test("SELECT_QUESTION_OPTION_AND_ADVANCE starts Other edit when Other has no text", () => {
    const state = makeTuiState({ question: makeQuestionState({ optionCursor: 2 }) });
    const next = reduceQuestionAction(state, Actions.selectQuestionOptionAndAdvance(2));
    expect(next.question?.editingOther).toBe(true);
    expect(next.question?.questionIndex).toBe(0);
  });

  test("TOGGLE_QUESTION_OPTION toggles multi-select options", () => {
    const state = makeTuiState({ question: makeQuestionState({ questionIndex: 1 }) });
    const first = reduceQuestionAction(state, Actions.toggleQuestionOption(0));
    expect(first.question?.selections[1]).toEqual([0]);
    const second = reduceQuestionAction(first, Actions.toggleQuestionOption(1));
    expect(second.question?.selections[1]).toEqual([0, 1]);
    const third = reduceQuestionAction(second, Actions.toggleQuestionOption(0));
    expect(third.question?.selections[1]).toEqual([1]);
  });

  test("TOGGLE_QUESTION_OPTION for single-select replaces the selection", () => {
    const state = makeTuiState({ question: makeQuestionState({ selections: [[0], []] }) });
    const next = reduceQuestionAction(state, Actions.toggleQuestionOption(1));
    expect(next.question?.selections[0]).toEqual([1]);
  });

  test("TOGGLE_QUESTION_OPTION for single-select clears the Other text", () => {
    const state = makeTuiState({ question: makeQuestionState({ otherText: ["custom"] }) });
    const next = reduceQuestionAction(state, Actions.toggleQuestionOption(1));
    expect(next.question?.selections[0]).toEqual([1]);
    expect(next.question?.otherText[0]).toBeNull();
  });

  test("TOGGLE_QUESTION_OPTION on Other starts edit when otherText is empty", () => {
    const state = makeTuiState({ question: makeQuestionState({ questionIndex: 1, optionCursor: 2 }) });
    const next = reduceQuestionAction(state, Actions.toggleQuestionOption(2));
    expect(next.question?.editingOther).toBe(true);
  });

  test("TOGGLE_QUESTION_OPTION on Other clears the text when present", () => {
    const state = makeTuiState({ question: makeQuestionState({ questionIndex: 1, otherText: [null, "custom"] }) });
    const next = reduceQuestionAction(state, Actions.toggleQuestionOption(2));
    expect(next.question?.otherText[1]).toBeNull();
    expect(next.question?.editingOther).toBe(false);
  });

  test("CONFIRM_QUESTION_OTHER stores the text and stops editing", () => {
    const state = makeTuiState({ question: makeQuestionState({ editingOther: true, optionCursor: 2 }) });
    const next = reduceQuestionAction(state, Actions.confirmQuestionOther("my answer"));
    expect(next.question?.otherText[0]).toBe("my answer");
    expect(next.question?.editingOther).toBe(false);
  });

  test("CONFIRM_QUESTION_OTHER stores null for empty text", () => {
    const state = makeTuiState({ question: makeQuestionState({ editingOther: true }) });
    const next = reduceQuestionAction(state, Actions.confirmQuestionOther("   "));
    expect(next.question?.otherText[0]).toBeNull();
  });

  test("STOP_QUESTION_OTHER_EDIT stops editing without saving", () => {
    const state = makeTuiState({ question: makeQuestionState({ editingOther: true, otherText: ["existing"] }) });
    const next = reduceQuestionAction(state, Actions.stopQuestionOtherEdit());
    expect(next.question?.editingOther).toBe(false);
    expect(next.question?.otherText[0]).toBe("existing");
  });

  test("NEXT_QUESTION advances to the next question", () => {
    const state = makeTuiState({ question: makeQuestionState({ questionIndex: 0, optionCursor: 1 }) });
    const next = reduceQuestionAction(state, Actions.nextQuestion());
    expect(next.question?.questionIndex).toBe(1);
    expect(next.question?.optionCursor).toBe(0);
  });

  test("SUBMIT_QUESTION_ANSWERS clears the question", () => {
    const state = makeTuiState({ question: makeQuestionState() });
    const next = reduceQuestionAction(state, Actions.submitQuestionAnswers("req-1", [{ header: "Approach", selected: ["A"], other: null }]));
    expect(next.question).toBeNull();
  });

  test("CANCEL_QUESTION clears the question", () => {
    const state = makeTuiState({ question: makeQuestionState() });
    const next = reduceQuestionAction(state, Actions.cancelQuestion("req-1"));
    expect(next.question).toBeNull();
  });

  test("ignores non-question actions", () => {
    const state = makeTuiState({ question: makeQuestionState() });
    const next = reduceQuestionAction(state, Actions.setEditorText("hello"));
    expect(next.question).toEqual(makeQuestionState());
  });
});

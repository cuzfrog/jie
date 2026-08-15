import { ActionTypes, type Action } from "./actions";
import type { AgentId, TuiState } from "./state";
import { TuiState as TuiStateHelpers } from "./state";

type QuestionState = NonNullable<TuiState["question"]>;

export function reduceQuestionAction(state: TuiState, action: Action): TuiState {
  switch (action.type) {
    case ActionTypes.SHOW_QUESTIONS:
      return showQuestions(state, action.payload.requestId, action.payload.agentId, action.payload.questions);
    case ActionTypes.MOVE_QUESTION_CURSOR:
      return moveQuestionCursor(state, action.payload.direction);
    case ActionTypes.SELECT_QUESTION_OPTION_AND_ADVANCE:
      return selectQuestionOptionAndAdvance(state, action.payload.optionIndex);
    case ActionTypes.TOGGLE_QUESTION_OPTION:
      return toggleQuestionOption(state, action.payload.optionIndex);
    case ActionTypes.START_QUESTION_OTHER_EDIT:
      return startQuestionOtherEdit(state);
    case ActionTypes.STOP_QUESTION_OTHER_EDIT:
      return stopQuestionOtherEdit(state);
    case ActionTypes.CONFIRM_QUESTION_OTHER:
      return confirmQuestionOther(state, action.payload.text);
    case ActionTypes.NEXT_QUESTION:
      return nextQuestion(state);
    case ActionTypes.SUBMIT_QUESTION_ANSWERS:
      return { ...state, question: null };
    case ActionTypes.CANCEL_QUESTION:
      return { ...state, question: null };
    default:
      return state;
  }
}

function showQuestions(state: TuiState, requestId: string, agentId: AgentId, questions: QuestionState["questions"]): TuiState {
  const q: QuestionState = {
    requestId,
    agentId,
    questions,
    questionIndex: 0,
    optionCursor: 0,
    selections: questions.map(() => []),
    otherText: questions.map(() => null),
    editingOther: false,
  };
  return { ...TuiStateHelpers.closeOtherPanels(state), question: q };
}

function currentQuestion(q: QuestionState): QuestionState["questions"][number] {
  return q.questions[q.questionIndex]!;
}

function otherIndex(q: QuestionState): number {
  return currentQuestion(q).options.length;
}

function moveQuestionCursor(state: TuiState, direction: "up" | "down"): TuiState {
  const q = state.question;
  if (q === null || q.editingOther) return state;
  const total = currentQuestion(q).options.length + 1;
  const delta = direction === "up" ? -1 : 1;
  const optionCursor = (q.optionCursor + delta + total) % total;
  const other = otherIndex(q);
  const editingOther = optionCursor === other && q.otherText[q.questionIndex] === null;
  return { ...state, question: { ...q, optionCursor, editingOther } };
}

function selectQuestionOptionAndAdvance(state: TuiState, optionIndex: number): TuiState {
  const q = state.question;
  if (q === null) return state;
  const other = otherIndex(q);
  if (optionIndex === other) {
    if (q.otherText[q.questionIndex] === null) {
      return startQuestionOtherEdit(state);
    }
    return advance(state, [], q.otherText[q.questionIndex] ?? null);
  }
  return advance(state, [optionIndex], null);
}

function advance(state: TuiState, selected: ReadonlyArray<number>, other: string | null): TuiState {
  const q = state.question;
  if (q === null) return state;
  const selections = [...q.selections];
  selections[q.questionIndex] = selected;
  const otherText = [...q.otherText];
  otherText[q.questionIndex] = other;
  const nextQuestionIndex = q.questionIndex + 1;
  if (nextQuestionIndex >= q.questions.length) {
    return { ...state, question: null };
  }
  return {
    ...state,
    question: {
      ...q,
      selections,
      otherText,
      questionIndex: nextQuestionIndex,
      optionCursor: 0,
      editingOther: false,
    },
  };
}

function toggleQuestionOption(state: TuiState, optionIndex: number): TuiState {
  const q = state.question;
  if (q === null || q.editingOther) return state;
  const other = otherIndex(q);
  if (optionIndex === other) {
    const otherText = [...q.otherText];
    if (otherText[q.questionIndex] !== null) {
      otherText[q.questionIndex] = null;
      return { ...state, question: { ...q, otherText, editingOther: false } };
    }
    return { ...state, question: { ...q, otherText, editingOther: true, optionCursor: other } };
  }
  const item = currentQuestion(q);
  const selections = [...q.selections];
  const current = selections[q.questionIndex] ?? [];
  if (item.multiSelect) {
    const set = new Set(current);
    if (set.has(optionIndex)) set.delete(optionIndex);
    else set.add(optionIndex);
    const sorted = [...set].sort((a, b) => a - b);
    selections[q.questionIndex] = sorted;
  } else {
    selections[q.questionIndex] = [optionIndex];
    const otherText = [...q.otherText];
    otherText[q.questionIndex] = null;
    return { ...state, question: { ...q, selections, otherText } };
  }
  return { ...state, question: { ...q, selections } };
}

function startQuestionOtherEdit(state: TuiState): TuiState {
  const q = state.question;
  if (q === null) return state;
  return { ...state, question: { ...q, editingOther: true, optionCursor: otherIndex(q) } };
}

function stopQuestionOtherEdit(state: TuiState): TuiState {
  const q = state.question;
  if (q === null) return state;
  return { ...state, question: { ...q, editingOther: false } };
}

function confirmQuestionOther(state: TuiState, text: string): TuiState {
  const q = state.question;
  if (q === null) return state;
  const otherText = [...q.otherText];
  otherText[q.questionIndex] = text.trim() === "" ? null : text;
  return { ...state, question: { ...q, otherText, editingOther: false } };
}

function nextQuestion(state: TuiState): TuiState {
  const q = state.question;
  if (q === null) return state;
  const nextQuestionIndex = q.questionIndex + 1;
  if (nextQuestionIndex >= q.questions.length) {
    return { ...state, question: null };
  }
  return {
    ...state,
    question: { ...q, questionIndex: nextQuestionIndex, optionCursor: 0, editingOther: false },
  };
}

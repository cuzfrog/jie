import { Input, matchesKey, truncateToWidth, visibleWidth, type Focusable } from "@earendil-works/pi-tui";
import type { QuestionAnswer, QuestionItem } from "../../../platform";
import { Actions, type StateStore, type TuiState } from "../../state";
import { type TuiComponent } from "../..";
import { Panel } from "./panel";
import { style } from "../themes";

type QuestionState = NonNullable<TuiState["question"]>;

const OTHER_LABEL = "Other";

export class QuestionPanel extends Panel implements TuiComponent, Focusable {
  public focused = false;
  private question: QuestionState | null = null;
  private readonly input = new Input();
  private inputValueInitialized = false;

  constructor(stateStore: StateStore) {
    super(stateStore);
    this.input.onSubmit = () => this.confirmOtherEdit();
    this.input.onEscape = () => this.cancelOtherEdit();
  }

  update(): boolean {
    const state = this.stateStore.getState();
    const question = state.question;
    if (this.sameQuestion(question)) return false;
    if (question !== null && question.editingOther && (!this.question?.editingOther || !this.inputValueInitialized)) {
      this.input.setValue(question.otherText[question.questionIndex] ?? "");
      this.inputValueInitialized = true;
    } else if (question !== null && !question.editingOther) {
      this.inputValueInitialized = false;
    }
    this.question = question === null ? null : { ...question };
    return true;
  }

  handleInput(data: string): void {
    const question = this.stateStore.getState().question;
    if (question === null) return;
    if (question.editingOther) {
      if (matchesKey(data, "escape")) {
        this.cancelOtherEdit();
        return;
      }
      if (matchesKey(data, "ctrl+c") || matchesKey(data, "ctrl+d") || matchesKey(data, "ctrl+g")) {
        this.cancelQuestion(question);
        return;
      }
      this.input.handleInput(data);
      return;
    }
    if (matchesKey(data, "up")) {
      this.stateStore.dispatch(Actions.moveQuestionCursor("up"));
      return;
    }
    if (matchesKey(data, "down")) {
      this.stateStore.dispatch(Actions.moveQuestionCursor("down"));
      return;
    }
    if (matchesKey(data, "space")) {
      this.handleSpace(question);
      return;
    }
    if (matchesKey(data, "enter")) {
      this.handleEnter(question);
      return;
    }
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || matchesKey(data, "ctrl+d") || matchesKey(data, "ctrl+g")) {
      this.cancelQuestion(question);
    }
  }

  protected override isVisible(state: TuiState): boolean {
    return state.question !== null;
  }

  protected override topBorder(state: TuiState, width: number): string | null {
    const q = state.question;
    if (q === null) return null;
    const label = `${q.questions[q.questionIndex].header} · ${q.questionIndex + 1}/${q.questions.length}`;
    return renderTopBorder(label, width);
  }

  protected override body(state: TuiState, inner: number): string[] {
    const q = state.question;
    if (q === null) return [];
    this.input.focused = this.focused && q.editingOther;
    const item = q.questions[q.questionIndex];
    const otherIndex = item.options.length;
    const lines: string[] = [];
    lines.push(truncateToWidth(style("text")(item.question), inner));
    lines.push("");
    for (let i = 0; i < item.options.length; i += 1) {
      lines.push(renderOption(item, i, q, inner));
    }
    lines.push(renderOtherOption(q, otherIndex, inner));
    if (q.editingOther) {
      const inputWidth = Math.max(1, inner - 8);
      const inputLine = this.input.render(inputWidth)[0] ?? "";
      lines.push("");
      lines.push(truncateToWidth(`${style("accent")("Other:")} ${inputLine}`, inner));
    }
    return lines;
  }

  protected override hint(_state: TuiState, width: number): string | null {
    return truncateToWidth(style("dim")("↑↓ move · space toggle/edit · enter select/confirm · esc cancel"), width);
  }

  private sameQuestion(question: TuiState["question"]): boolean {
    if (question === null && this.question === null) return true;
    if (question === null || this.question === null) return false;
    return (
      question.requestId === this.question.requestId &&
      question.questionIndex === this.question.questionIndex &&
      question.optionCursor === this.question.optionCursor &&
      question.selections === this.question.selections &&
      question.otherText === this.question.otherText &&
      question.editingOther === this.question.editingOther
    );
  }

  private handleSpace(question: QuestionState): void {
    const cursor = question.optionCursor;
    if (cursor === otherIndexOf(question) && question.otherText[question.questionIndex] === null) {
      this.stateStore.dispatch(Actions.startQuestionOtherEdit());
      return;
    }
    this.stateStore.dispatch(Actions.toggleQuestionOption(cursor));
  }

  private handleEnter(question: QuestionState): void {
    const cursor = question.optionCursor;
    const item = question.questions[question.questionIndex];
    if (question.questionIndex === question.questions.length - 1) {
      this.submitAnswers(question);
      return;
    }
    if (cursor === otherIndexOf(question)) {
      if (question.otherText[question.questionIndex] === null) {
        this.stateStore.dispatch(Actions.startQuestionOtherEdit());
      } else if (item.multiSelect) {
        this.stateStore.dispatch(Actions.nextQuestion());
      } else {
        this.stateStore.dispatch(Actions.selectQuestionOptionAndAdvance(cursor));
      }
      return;
    }
    if (item.multiSelect) {
      this.stateStore.dispatch(Actions.nextQuestion());
    } else {
      this.stateStore.dispatch(Actions.selectQuestionOptionAndAdvance(cursor));
    }
  }

  private submitAnswers(question: QuestionState): void {
    const answers: QuestionAnswer[] = question.questions.map((item, i) => {
      const selected = question.selections[i].map((index) => item.options[index].label);
      if (question.otherText[i] !== null) selected.push(OTHER_LABEL);
      return { header: item.header, selected, other: question.otherText[i] };
    });
    this.stateStore.dispatch(Actions.submitQuestionAnswers(question.requestId, answers));
  }

  private cancelOtherEdit(): void {
    this.stateStore.dispatch(Actions.stopQuestionOtherEdit());
  }

  private confirmOtherEdit(): void {
    this.stateStore.dispatch(Actions.confirmQuestionOther(this.input.getValue()));
  }

  private cancelQuestion(question: QuestionState): void {
    this.stateStore.dispatch(Actions.cancelQuestion(question.requestId));
  }
}

function otherIndexOf(question: QuestionState): number {
  return question.questions[question.questionIndex].options.length;
}

function renderTopBorder(label: string, width: number): string {
  const border = style("borderMuted");
  const left = `┌ ${label} · `;
  const fill = "─".repeat(Math.max(0, width - visibleWidth(left) - 1));
  return border(`${left}${fill}┐`);
}

function renderOption(item: QuestionItem, index: number, question: QuestionState, inner: number): string {
  const option = item.options[index];
  const cursor = question.optionCursor === index ? style("accent")("> ") : "  ";
  const marker = item.multiSelect ? multiMarker(question, index) : singleMarker(question, index);
  const text = `${cursor}${marker} ${option.label}  ${style("muted")(option.description)}`;
  return truncateToWidth(text, inner);
}

function renderOtherOption(question: QuestionState, otherIndex: number, inner: number): string {
  const item = question.questions[question.questionIndex];
  const selected = question.otherText[question.questionIndex] !== null;
  const cursor = question.optionCursor === otherIndex ? style("accent")("> ") : "  ";
  const marker = item.multiSelect ? (selected ? "[x]" : "[ ]") : (selected ? "(•)" : "( )");
  const otherText = question.otherText[question.questionIndex];
  const text = otherText === null
    ? `${cursor}${marker} ${OTHER_LABEL}`
    : `${cursor}${marker} ${OTHER_LABEL}  ${style("muted")(otherText)}`;
  return truncateToWidth(text, inner);
}

function multiMarker(question: QuestionState, index: number): string {
  return question.selections[question.questionIndex].includes(index) ? "[x]" : "[ ]";
}

function singleMarker(question: QuestionState, index: number): string {
  return question.selections[question.questionIndex].includes(index) ? "(•)" : "( )";
}

import { Type } from "typebox";
import { JiePlatformError } from "../jie-platform-errors";
import type { QuestionItem, QuestionOption } from "../types";
import type { ExecutionContext, Tool, ToolResult } from "./types";
import type { QuestionBroker, QuestionResult } from "./ask-user-questions-broker";

const MAX_QUESTIONS = 8;
const MAX_OPTIONS = 8;
const MAX_QUESTION_LENGTH = 500;
const MAX_HEADER_LENGTH = 80;
const MAX_LABEL_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 200;

const ASK_USER_QUESTIONS_DESCRIPTION = `Ask the user one or more multiple-choice questions when you need a decision, clarification, or preference that cannot be inferred. Each question: 'question' text, short 'header', 'options' array of { label, description }, and 'multiSelect'. Returns a summary of the answers. Does NOT end the turn.`;

export interface AskUserQuestionsDeps {
  questionBroker: QuestionBroker;
}

interface AskUserQuestionsInput {
  questions: QuestionItem[];
}

export function createAskUserQuestionsTool(dependencies: AskUserQuestionsDeps): Tool<AskUserQuestionsInput> {
  return {
    name: "ask_user_questions",
    description: ASK_USER_QUESTIONS_DESCRIPTION,
    label: "Ask Questions",
    parameters: Type.Object({
      questions: Type.Array(Type.Object({
        question: Type.String(),
        header: Type.String(),
        options: Type.Array(Type.Object({
          label: Type.String(),
          description: Type.String(),
        })),
        multiSelect: Type.Boolean(),
      })),
    }),
    async execute(input: AskUserQuestionsInput, executionContext: ExecutionContext, signal?: AbortSignal): Promise<ToolResult> {
      validateQuestions(input.questions);
      const result = await dependencies.questionBroker.ask({
        teamId: executionContext.teamId,
        agentKey: executionContext.agentKey,
        questions: input.questions,
      }, signal);
      return { content: formatQuestionResult(result) };
    },
  };
}

function validateQuestions(questions: ReadonlyArray<QuestionItem>): void {
  if (questions.length === 0) throw new JiePlatformError("QUESTION_INVALID", { detail: "questions array is empty" });
  if (questions.length > MAX_QUESTIONS) throw new JiePlatformError("QUESTION_INVALID", { detail: `too many questions: ${questions.length} > ${MAX_QUESTIONS}` });
  const headers = new Set<string>();
  for (const [index, q] of questions.entries()) {
    if (q.question.length === 0) throw new JiePlatformError("QUESTION_INVALID", { detail: `question ${index} is empty` });
    if (q.question.length > MAX_QUESTION_LENGTH) throw new JiePlatformError("QUESTION_INVALID", { detail: `question ${index} question text too long` });
    if (q.header.length === 0) throw new JiePlatformError("QUESTION_INVALID", { detail: `question ${index} header is empty` });
    if (q.header.length > MAX_HEADER_LENGTH) throw new JiePlatformError("QUESTION_INVALID", { detail: `question ${index} header too long` });
    if (headers.has(q.header)) throw new JiePlatformError("QUESTION_INVALID", { detail: `duplicate header: ${q.header}` });
    headers.add(q.header);
    if (q.options.length === 0) throw new JiePlatformError("QUESTION_INVALID", { detail: `question ${index} has no options` });
    if (q.options.length > MAX_OPTIONS) throw new JiePlatformError("QUESTION_INVALID", { detail: `question ${index} too many options` });
    const labels = new Set<string>();
    for (const [optIndex, opt] of q.options.entries()) {
      validateOption(index, optIndex, opt, labels);
    }
  }
}

function validateOption(questionIndex: number, optionIndex: number, opt: QuestionOption, labels: Set<string>): void {
  if (opt.label.length === 0) throw new JiePlatformError("QUESTION_INVALID", { detail: `question ${questionIndex} option ${optionIndex} label is empty` });
  if (opt.label.length > MAX_LABEL_LENGTH) throw new JiePlatformError("QUESTION_INVALID", { detail: `question ${questionIndex} option ${optionIndex} label too long` });
  if (opt.description.length === 0) throw new JiePlatformError("QUESTION_INVALID", { detail: `question ${questionIndex} option ${optionIndex} description is empty` });
  if (opt.description.length > MAX_DESCRIPTION_LENGTH) throw new JiePlatformError("QUESTION_INVALID", { detail: `question ${questionIndex} option ${optionIndex} description too long` });
  if (labels.has(opt.label)) throw new JiePlatformError("QUESTION_INVALID", { detail: `question ${questionIndex} duplicate label: ${opt.label}` });
  labels.add(opt.label);
}

function formatQuestionResult(result: QuestionResult): string {
  if (result.cancelled || result.answers === null) return "The user declined to answer.";
  if (result.answers.length === 0) return "The user did not answer any questions.";
  const lines = ["The user answered:"];
  for (const answer of result.answers) {
    const selected = answer.selected.length === 0 ? "none" : answer.selected.join(", ");
    const other = answer.other !== null ? ` (other: ${answer.other})` : "";
    lines.push(`- ${answer.header}: ${selected}${other}`);
  }
  return lines.join("\n");
}

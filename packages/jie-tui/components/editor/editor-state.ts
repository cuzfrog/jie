export interface EditorBuffer {
  readonly lines: ReadonlyArray<string>;
  readonly cursorLine: number;
  readonly cursorCol: number;
}

export type EditorAction =
  | { readonly type: "insert"; readonly text: string }
  | { readonly type: "insert-newline" }
  | { readonly type: "backspace" }
  | { readonly type: "delete" }
  | { readonly type: "cursor-left" }
  | { readonly type: "cursor-right" }
  | { readonly type: "cursor-up" }
  | { readonly type: "cursor-down" }
  | { readonly type: "line-start" }
  | { readonly type: "line-end" }
  | {
      readonly type: "reset-value";
      readonly lines: ReadonlyArray<string>;
      readonly cursorLine?: number;
      readonly cursorCol?: number;
    };

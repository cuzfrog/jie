import { useEffect, useRef, useState, type JSX } from "react";
import { Box } from "@cuzfrog/jie-ink";
import wrapAnsi from "wrap-ansi";
import { useTuiContext } from "./context";
import { ChatPane } from "./chat";
import { AgentsRail } from "./team-rail";
import { railWidth } from "./themes";
import { Editor } from "./editor";
import { Footer } from "./footer";
import { MAX_VISIBLE_TODOS, TodoList, todoListRowCount } from "./agent-todo";
import { SlashAutocomplete, SLASH_COMMAND_NAMES } from "../slash-autocomplete";
import { FileMention, scanFiles, type FileEntry } from "../file-mention";
import { Actions } from "../state";

const MAX_EDITOR_CONTENT_ROWS = 8;
const EDITOR_BORDER_ROWS = 2;
const EDITOR_PADDING_COLS = 2;
const FOOTER_ROWS = 2;
const TODO_BORDER_ROWS = 2;

interface LayoutProps {
  readonly columns: number;
  readonly rows: number;
}

export function Layout(props: LayoutProps): JSX.Element {
  const { state, dispatch } = useTuiContext();
  const editorTextRef = useRef<string>(state.editorText);
  editorTextRef.current = state.editorText;
  const railVisible = state.showTeamRailPanel;
  const rail = railVisible ? railWidth(props.columns) : 0;
  const chatWidth = Math.max(1, props.columns - rail - (rail > 0 ? 1 : 0));
  const todoHeight = todoPanelHeight(state);
  const editorHeight = editorPanelHeight(state, props.columns);
  const chatHeight = Math.max(1, props.rows - editorHeight - FOOTER_ROWS - todoHeight);
  const [files, setFiles] = useState<ReadonlyArray<FileEntry>>([]);
  useEffect(() => {
    const cwd = state.cwd;
    if (cwd === null) {
      setFiles([]);
      return;
    }
    setFiles(scanFiles(cwd).map((f) => ({ path: f.relPath })));
  }, [state.cwd]);

  return (
    <Box flexDirection="column" width={props.columns} height={props.rows}>
      <Box flexDirection="row" flexGrow={1} width="100%">
        {rail > 0 ? <AgentsRail width={rail} /> : null}
        {rail > 0 ? (
          <Box width={1} height="100%"><Box flexGrow={1} /></Box>
        ) : null}
        <ChatPane width={chatWidth} height={chatHeight} />
      </Box>
      <Box width="100%" maxHeight={MAX_VISIBLE_TODOS + TODO_BORDER_ROWS} overflow="hidden" flexShrink={0}>
        <TodoList width={props.columns} />
      </Box>
      <Box width="100%" maxHeight={editorHeight} overflow="hidden" flexShrink={0}>
        <Editor width={props.columns} maxContentRows={MAX_EDITOR_CONTENT_ROWS} />
      </Box>
      <Box width="100%" flexShrink={0}>
        <SlashAutocomplete
          editorText={state.editorText}
          sessionPickerOpen={state.sessionPickerOpen}
          commands={SLASH_COMMAND_NAMES}
          onCommit={(command, argv): void => {
            const suffix = argv.length === 0 ? "" : ` ${argv}`;
            dispatch(Actions.setEditorText(""));
            dispatch(Actions.submitEditorText(`/${command}${suffix}`));
          }}
        />
      </Box>
      <Box width="100%" flexShrink={0}>
        <FileMention
          editorText={state.editorText}
          sessionPickerOpen={state.sessionPickerOpen}
          files={files}
          onInsert={(path): void => {
            const current = editorTextRef.current;
            const next = current.endsWith("@")
              ? `${current}${path} `
              : `${current} ${path} `;
            dispatch(Actions.setEditorText(next));
          }}
        />
      </Box>
      <Footer cwd={state.cwd ?? ""} gitBranch={state.gitBranch ?? ""} gitDirty={state.gitDirty} />
    </Box>
  );
}

function todoPanelHeight(state: ReturnType<typeof useTuiContext>["state"]): number {
  const focusedId = state.focusedAgentId;
  if (focusedId === null) return 0;
  const focused = state.agents.get(focusedId);
  if (focused === undefined) return 0;
  const visibleRows = todoListRowCount(focused.todos.length);
  if (visibleRows === 0) return 0;
  return visibleRows + TODO_BORDER_ROWS;
}

function editorPanelHeight(state: ReturnType<typeof useTuiContext>["state"], columns: number): number {
  const inner = Math.max(1, columns - EDITOR_PADDING_COLS);
  let contentRows = 0;
  for (const line of state.editorText.split("\n")) {
    contentRows += Math.max(1, rowsForText(line, inner));
  }
  if (state.errorBanner !== null && state.errorBanner !== "") contentRows += 1;
  if (state.transientMessage !== null && state.transientMessage !== "") contentRows += 1;
  return Math.min(contentRows, MAX_EDITOR_CONTENT_ROWS) + EDITOR_BORDER_ROWS;
}

function rowsForText(text: string, width: number): number {
  if (text.length === 0) return 0;
  return wrapAnsi(text, Math.max(1, width), { trim: false, hard: true }).split("\n").length;
}

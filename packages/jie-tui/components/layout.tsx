import { Box } from "@cuzfrog/jie-ink";
import type { JSX } from "react";
import { useTuiContext } from "./context";
import { ChatPane } from "./chat";
import { AgentsRail } from "./team-rail";
import { railWidth } from "./themes";
import { Editor } from "./editor";
import { Footer } from "./footer";
import { MAX_VISIBLE_TODOS, TodoList, todoListRowCount } from "./agent-todo";
import { TransientBanner } from "./transient-banner/transient-banner";
import { SlashAutocomplete, SLASH_COMMAND_NAMES } from "../slash-autocomplete";
import { Actions } from "../state";

const EDITOR_ROWS = 8;
const FOOTER_ROWS = 2;
const TODO_BORDER_ROWS = 2;

interface LayoutProps {
  readonly columns: number;
  readonly rows: number;
}

export function Layout(props: LayoutProps): JSX.Element {
  const { state, dispatch } = useTuiContext();
  const railVisible = state.showTeamRailPanel;
  const rail = railVisible ? railWidth(props.columns) : 0;
  const chatWidth = Math.max(1, props.columns - rail - (rail > 0 ? 1 : 0));
  const todoHeight = todoPanelHeight(state);
  const chatHeight = Math.max(1, props.rows - EDITOR_ROWS - FOOTER_ROWS - todoHeight);

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
      <Box width="100%" maxHeight={EDITOR_ROWS} overflow="hidden" flexShrink={0}>
        <Editor />
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
      <TransientBanner />
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

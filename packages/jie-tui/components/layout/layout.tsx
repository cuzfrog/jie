import { Box } from "ink";
import type { StateStore } from "../../state";
import { useTuiContext } from "../context";
import { ChatPane } from "../chat/chat-pane";
import { AgentsRail } from "../rail/agents-rail";
import { railWidth } from "../themes";
import { Editor } from "./editor";
import { Footer } from "./footer";

export interface LayoutProps {
  readonly columns: number;
  readonly rows: number;
  readonly cwd: string;
  readonly gitBranch: string;
  readonly gitDirty: boolean;
  readonly stateStore: StateStore;
  readonly onSubmit: (text: string) => void;
}

const FOOTER_LINES = 2;
const EDITOR_BORDER_LINES = 2;
const FOOTER_BORDER_LINES = 2;

export function Layout(props: LayoutProps): JSX.Element {
  const { state } = useTuiContext();
  const railVisible = state.showTeamRailPanel;
  const editorHeight = editorHeightFor(props.rows);
  const bodyHeight = bodyHeightFor(props.rows, editorHeight);
  const rail = railVisible ? railWidth(props.columns) : 0;
  const chatWidth = Math.max(1, props.columns - rail - (rail > 0 ? 1 : 0));

  return (
    <Box flexDirection="column" width={props.columns} height={props.rows}>
      <Box flexDirection="row" width="100%" height={bodyHeight}>
        {rail > 0 ? <AgentsRail width={rail} /> : null}
        {rail > 0 ? (
          <Box width={1} height="100%"><Box flexGrow={1} /></Box>
        ) : null}
        <ChatPane width={chatWidth} />
      </Box>
      <Box width="100%" height={editorHeight}>
        <Editor stateStore={props.stateStore} onSubmit={props.onSubmit} />
      </Box>
      <Box width="100%" height={FOOTER_BORDER_LINES}><Box flexGrow={1} /></Box>
      <Footer cwd={props.cwd} gitBranch={props.gitBranch} gitDirty={props.gitDirty} />
      <Box width="100%" height={FOOTER_LINES}><Box flexGrow={1} /></Box>
    </Box>
  );
}

function editorHeightFor(rows: number): number {
  return Math.max(5, Math.floor(rows * 0.3)) + EDITOR_BORDER_LINES;
}

function bodyHeightFor(rows: number, editorHeight: number): number {
  return Math.max(1, rows - editorHeight - FOOTER_BORDER_LINES - FOOTER_LINES);
}
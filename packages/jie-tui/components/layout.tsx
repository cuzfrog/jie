import { Box } from "@cuzfrog/jie-ink";
import type { JSX } from "react";
import { useTuiContext } from "./context";
import { ChatPane } from "./chat";
import { AgentsRail } from "./team-rail";
import { railWidth } from "./themes";
import { Editor } from "./editor";
import { Footer } from "./footer";

const EDITOR_ROWS = 8;
const FOOTER_ROWS = 2;

interface LayoutProps {
  readonly columns: number;
  readonly rows: number;
}

export function Layout(props: LayoutProps): JSX.Element {
  const { state } = useTuiContext();
  const railVisible = state.showTeamRailPanel;
  const rail = railVisible ? railWidth(props.columns) : 0;
  const chatWidth = Math.max(1, props.columns - rail - (rail > 0 ? 1 : 0));
  const chatHeight = Math.max(1, props.rows - EDITOR_ROWS - FOOTER_ROWS);

  return (
    <Box flexDirection="column" width={props.columns} height={props.rows}>
      <Box flexDirection="row" flexGrow={1} width="100%">
        {rail > 0 ? <AgentsRail width={rail} /> : null}
        {rail > 0 ? (
          <Box width={1} height="100%"><Box flexGrow={1} /></Box>
        ) : null}
        <ChatPane width={chatWidth} height={chatHeight} />
      </Box>
      <Box width="100%" maxHeight={EDITOR_ROWS} overflow="hidden" flexShrink={0}>
        <Editor />
      </Box>
      <Footer cwd={state.cwd ?? ""} gitBranch={state.gitBranch ?? ""} gitDirty={state.gitDirty} />
    </Box>
  );
}

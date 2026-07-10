import { Box } from "ink";
import type { JSX } from "react";
import { useTuiContext } from "./context";
import { ChatPane } from "./chat";
import { AgentsRail } from "./team-rail";
import { railWidth } from "./themes";
import { Editor, Footer } from "./panel";

interface LayoutProps {
  readonly columns: number;
  readonly rows: number;
}

export function Layout(props: LayoutProps): JSX.Element {
  const { state } = useTuiContext();
  const railVisible = state.showTeamRailPanel;
  const rail = railVisible ? railWidth(props.columns) : 0;
  const chatWidth = Math.max(1, props.columns - rail - (rail > 0 ? 1 : 0));

  return (
    <Box flexDirection="column" width={props.columns} height={props.rows}>
      <Box flexDirection="row" flexGrow={1} width="100%">
        {rail > 0 ? <AgentsRail width={rail} /> : null}
        {rail > 0 ? (
          <Box width={1} height="100%"><Box flexGrow={1} /></Box>
        ) : null}
        <ChatPane width={chatWidth} />
      </Box>
      <Box width="100%">
        <Editor />
      </Box>
      <Footer cwd={state.cwd ?? ""} gitBranch={state.gitBranch ?? ""} gitDirty={state.gitDirty} />
    </Box>
  );
}
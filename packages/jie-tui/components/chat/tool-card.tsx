import { Box, Text } from "ink";
import type { MessageCard } from "../../state";
import { pickColor } from "../themes";

export interface ToolCardProps {
  readonly card: MessageCard;
  readonly expanded: boolean;
}

const SUCCESS_GLYPH = "✓";

export function ToolCard({ card, expanded }: ToolCardProps): JSX.Element {
  const isError = card.error !== undefined && card.error !== null && card.error !== "";
  const statusGlyph = isError ? "✗" : SUCCESS_GLYPH;
  const durationText = card.durationMs !== undefined ? `  ${card.durationMs}ms` : "";
  const headerText = `${statusGlyph} ${card.name}${durationText}`;

  if (!expanded) {
    return (
      <Text color={isError ? pickColor("error") : pickColor("toolTitle")}>{headerText}</Text>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={isError ? pickColor("error") : pickColor("toolTitle")}>{headerText}</Text>
      {card.input !== undefined && card.input !== "" ? (
        <Box flexDirection="column">
          <Text color={pickColor("muted")}>input:</Text>
          <Text color={pickColor("toolOutput")}>{card.input}{card.inputTruncated === true ? "…" : ""}</Text>
        </Box>
      ) : null}
      {card.output !== undefined && card.output !== null && card.output !== "" ? (
        <Box flexDirection="column">
          <Text color={pickColor("muted")}>output:</Text>
          <Text color={pickColor("toolOutput")}>{card.output}{card.outputTruncated === true ? "…" : ""}</Text>
        </Box>
      ) : null}
      {isError ? (
        <Text color={pickColor("error")}>error: {card.error}</Text>
      ) : null}
    </Box>
  );
}
import type { JSX } from "react";
import { Box, Text } from "@cuzfrog/jie-ink";
import { useTuiContext } from "../context";
import { pickColor } from "../themes";

interface ErrorBannerProps {}

export function ErrorBanner(_props: ErrorBannerProps): JSX.Element {
  const { state } = useTuiContext();
  const message = state.errorBanner;
  if (message === null || message === "") return <Box />;
  return (
    <Box width="100%">
      <Text color={pickColor("error")}>{`✗ ${message}`}</Text>
    </Box>
  );
}

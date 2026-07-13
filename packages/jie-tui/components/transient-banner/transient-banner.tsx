import { useEffect, type JSX } from "react";
import { Box, Text } from "@cuzfrog/jie-ink";
import { useTuiContext } from "../context";
import { Actions } from "../../state";
import { pickColor } from "../themes";

interface TransientBannerProps {}

export function TransientBanner(_props: TransientBannerProps): JSX.Element {
  const { state } = useTuiContext();
  const message = state.transientMessage;
  if (message === null || message === "") return <Box />;
  return <TransientBannerContent key={message} message={message} />;
}

interface TransientBannerContentProps {
  readonly message: string;
}

const TRANSIENT_TTL_MS = 5000;

function TransientBannerContent({ message }: TransientBannerContentProps): JSX.Element {
  const { dispatch } = useTuiContext();

  useEffect(() => {
    const timer = setTimeout(() => {
      dispatch(Actions.clearTransientMessage());
    }, TRANSIENT_TTL_MS);
    return () => clearTimeout(timer);
  }, [dispatch]);

  return (
    <Box width="100%">
      <Text color={pickColor("success")}>{`✓ ${message}`}</Text>
    </Box>
  );
}

export const _TRANSIENT_TTL_MS = TRANSIENT_TTL_MS;
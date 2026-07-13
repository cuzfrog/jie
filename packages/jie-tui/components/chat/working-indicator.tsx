import { type JSX } from "react";
import { Text } from "@cuzfrog/jie-ink";
import { WORKING_LABEL, pickColor } from "../themes";
import { Spinner } from "../spinner";

interface WorkingIndicatorProps {
  readonly message?: string;
  readonly intervalMs?: number;
}

export function WorkingIndicator({ message = WORKING_LABEL, intervalMs }: WorkingIndicatorProps): JSX.Element {
  return (
    <Text>
      <Spinner intervalMs={intervalMs} />{" "}
      <Text color={pickColor("muted")}>{message}</Text>
    </Text>
  );
}
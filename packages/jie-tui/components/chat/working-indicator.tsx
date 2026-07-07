import { useEffect, useState } from "react";
import { Text } from "ink";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, WORKING_LABEL, pickColor } from "../themes";

export interface WorkingIndicatorProps {
  readonly message?: string;
  readonly intervalMs?: number;
  readonly now?: () => number;
}

export function WorkingIndicator({
  message = WORKING_LABEL,
  intervalMs = SPINNER_INTERVAL_MS,
  now = Date.now,
}: WorkingIndicatorProps): JSX.Element {
  const [frameIndex, setFrameIndex] = useState<number>(0);
  useEffect(() => {
    const tick = (): void => setFrameIndex((i) => (i + 1) % SPINNER_FRAMES.length);
    const handle = setInterval(tick, intervalMs);
    return (): void => clearInterval(handle);
  }, [intervalMs]);
  void now;
  const frame = SPINNER_FRAMES[frameIndex] ?? SPINNER_FRAMES[0]!;
  return (
    <Text>
      <Text color={pickColor("accent")}>{frame} </Text>
      <Text color={pickColor("muted")}>{message}</Text>
    </Text>
  );
}
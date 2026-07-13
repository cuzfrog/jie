import { useEffect, useState, type JSX } from "react";
import { Text } from "@cuzfrog/jie-ink";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, pickColor } from "./themes";

interface SpinnerProps {
  readonly intervalMs?: number;
}

export function Spinner({ intervalMs = SPINNER_INTERVAL_MS }: SpinnerProps): JSX.Element {
  const [frameIndex, setFrameIndex] = useState<number>(0);
  useEffect(() => {
    const tick = (): void => setFrameIndex(advanceFrameIndex);
    const handle = setInterval(tick, intervalMs);
    return (): void => clearInterval(handle);
  }, [intervalMs]);
  const frame = SPINNER_FRAMES[frameIndex] ?? SPINNER_FRAMES[0]!;
  return <Text color={pickColor("accent")}>{frame}</Text>;
}

export function advanceFrameIndex(current: number): number {
  return (current + 1) % SPINNER_FRAMES.length;
}
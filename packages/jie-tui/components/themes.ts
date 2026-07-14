export const COLORS = {
  accent: "cyan",
  border: "blue",
  borderMuted: "gray",
  success: "green",
  error: "red",
  warning: "yellow",
  muted: "gray",
  dim: "gray",
  text: "white",
  thinkingText: "gray",
  userMessageIcon: "cyan",
  assistantMessageIcon: "cyan",
  toolTitle: "white",
  toolOutput: "gray",
} as const;

export type ColorName = keyof typeof COLORS;

export function pickColor(name: ColorName): string {
  return COLORS[name];
}

const RAIL_WIDTH_MIN = 12;
const RAIL_WIDTH_SMALL_RATIO = 0.25;
const RAIL_WIDTH_LARGE_MIN = 15;
const RAIL_WIDTH_LARGE_MAX = 24;

export function railWidth(columns: number): number {
  if (columns < 80) return Math.max(RAIL_WIDTH_MIN, Math.floor(columns * RAIL_WIDTH_SMALL_RATIO));
  return Math.min(RAIL_WIDTH_LARGE_MAX, Math.max(RAIL_WIDTH_LARGE_MIN, Math.floor(columns * 0.25)));
}

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
export const SPINNER_INTERVAL_MS = 80;

export const QUEUE_PREVIEW_MAX_CHARS = 40;

export const RAIL_LEADER_GLYPH = "★";
export const RAIL_IDLE_GLYPH = "·";
export const RAIL_ERROR_GLYPH = "✗";
export const USER_PROMPT_PREFIX = "› ";
export const ASSISTANT_PREFIX = "● ";
export const THINKING_LABEL = "Thinking...";
export const WORKING_LABEL = "Working…";

export const BORDER_MUTED_CHAR = "─";
export const VERTICAL_SEPARATOR = "│";

export const DEFAULT_MIN_COLS = 60;

export function formatQueueIndicator(queue: ReadonlyArray<string> | null | undefined): string | null {
  if (queue === undefined || queue === null || queue.length === 0) return null;
  const next = queue[0] ?? "";
  const preview = truncateCodePoints(next, QUEUE_PREVIEW_MAX_CHARS);
  const truncated = next.length > preview.length;
  const shown = truncated ? `${preview}…` : preview;
  const suffix = queue.length === 1 ? "prompt" : "prompts";
  return `${queue.length} ${suffix} queued  > ${shown}`;
}

function truncateCodePoints(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  let end = maxChars;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff && end < text.length) {
    end += 1;
  }
  return text.slice(0, end);
}

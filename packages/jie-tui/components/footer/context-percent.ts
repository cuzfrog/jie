export function formatContextPercent(used: number, window: number | null): string {
  if (window === null || window <= 0) return "—";
  return `${computePercent(used, window)}%/${formatWindow(window)}`;
}

export function contextPercentColor(used: number, window: number | null): "muted" | "warning" | "error" {
  if (window === null || window <= 0) return "muted";
  const ratio = used / window;
  if (ratio >= CONTEXT_PERCENT_ERROR) return "error";
  if (ratio >= CONTEXT_PERCENT_WARN) return "warning";
  return "muted";
}

const CONTEXT_PERCENT_WARN = 0.7;
const CONTEXT_PERCENT_ERROR = 0.9;

function formatWindow(window: number): string {
  if (window >= 1000) return `${Math.floor(window / 1000)}k`;
  return String(window);
}

function computePercent(used: number, window: number): number {
  if (window <= 0) return 0;
  const ratio = used / window;
  if (ratio >= 1) return 100;
  return Math.floor(ratio * 100);
}

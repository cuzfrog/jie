export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) {
    const seconds = Math.round(ms / 100) / 10;
    return `${seconds % 1 === 0 ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

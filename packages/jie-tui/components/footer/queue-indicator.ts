export function formatQueueIndicator(queue: ReadonlyArray<string> | null | undefined): string | null {
  if (queue === undefined || queue === null || queue.length === 0) return null;
  const next = queue[0] ?? "";
  const preview = truncateCodePoints(next, QUEUE_PREVIEW_MAX_CHARS);
  const truncated = next.length > preview.length;
  const shown = truncated ? `${preview}…` : preview;
  const suffix = queue.length === 1 ? "prompt" : "prompts";
  return `${queue.length} ${suffix} queued  > ${shown}`;
}

const QUEUE_PREVIEW_MAX_CHARS = 40;

function truncateCodePoints(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  let end = maxChars;
  const code = text.charCodeAt(end - 1);
  if (code >= 0xd800 && code <= 0xdbff && end < text.length) {
    end += 1;
  }
  return text.slice(0, end);
}

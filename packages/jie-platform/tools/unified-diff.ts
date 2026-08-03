const DIFF_LINE_LIMIT = 5_000;

export function renderUnifiedDiff(before: string, after: string): string | null {
  if (countLines(before) > DIFF_LINE_LIMIT || countLines(after) > DIFF_LINE_LIMIT) return null;
  const oldLines = splitLines(before);
  const newLines = splitLines(after);
  const script = buildLineEditScript(oldLines, newLines);
  if (script.every((op) => op.kind === "equal")) return "";
  const hunks = buildHunks(script, 3);
  if (hunks.length === 0) return "";
  const blocks: string[] = [];
  for (const hunk of hunks) {
    blocks.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    for (const line of hunk.lines) blocks.push(line);
  }
  return blocks.join("\n");
}

interface DiffHunk {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly lines: ReadonlyArray<string>;
}

interface RawHunk {
  readonly opStart: number;
  readonly opEnd: number;
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly lines: ReadonlyArray<LineOp>;
}

type LineOp = { kind: "equal"; oldIndex: number; newIndex: number; text: string }
  | { kind: "delete"; oldIndex: number; text: string }
  | { kind: "insert"; newIndex: number; text: string };

function countLines(text: string): number {
  if (text === "") return 0;
  return text.split("\n").length;
}

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function buildHunks(ops: ReadonlyArray<LineOp>, context: number): DiffHunk[] {
  const raws: RawHunk[] = [];
  let cursor = 0;
  while (cursor < ops.length) {
    while (cursor < ops.length && ops[cursor]!.kind === "equal") cursor++;
    if (cursor >= ops.length) break;
    const opStart = Math.max(0, cursor - context);
    let opEnd = cursor;
    while (opEnd < ops.length && ops[opEnd]!.kind !== "equal") opEnd++;
    let trailingEqual = 0;
    while (opEnd + trailingEqual < ops.length && ops[opEnd + trailingEqual]!.kind === "equal" && trailingEqual < context * 2) {
      trailingEqual++;
    }
    opEnd += trailingEqual;
    raws.push(toRawHunk(ops, opStart, opEnd));
    cursor = opEnd;
  }
  const merged = mergeAdjacentRaws(raws, context * 2);
  return merged.map(renderRawHunk);
}

function toRawHunk(ops: ReadonlyArray<LineOp>, opStart: number, opEnd: number): RawHunk {
  let oldLines = 0;
  let newLines = 0;
  for (let i = opStart; i < opEnd; i++) {
    const op = ops[i]!;
    if (op.kind === "equal") {
      oldLines++;
      newLines++;
    } else if (op.kind === "delete") {
      oldLines++;
    } else {
      newLines++;
    }
  }
  const firstOp = ops[opStart]!;
  const oldStart = (firstOp.kind === "equal" ? firstOp.oldIndex : opStart) + 1;
  const newStart = (firstOp.kind === "equal" ? firstOp.newIndex : opStart) + 1;
  return {
    opStart,
    opEnd,
    oldStart,
    oldLines,
    newStart,
    newLines,
    lines: ops.slice(opStart, opEnd),
  };
}

function mergeAdjacentRaws(raws: ReadonlyArray<RawHunk>, gapLimit: number): RawHunk[] {
  if (raws.length === 0) return [];
  const out: RawHunk[] = [raws[0]!];
  for (let i = 1; i < raws.length; i++) {
    const previous = out[out.length - 1]!;
    const next = raws[i]!;
    const gap = next.opStart - previous.opEnd;
    if (gap <= gapLimit) {
      const mergedLines = [...previous.lines, ...next.lines];
      let oldLines = 0;
      let newLines = 0;
      for (const op of mergedLines) {
        if (op.kind === "equal") {
          oldLines++;
          newLines++;
        } else if (op.kind === "delete") {
          oldLines++;
        } else {
          newLines++;
        }
      }
      const firstOp = mergedLines[0]!;
      const oldStart = (firstOp.kind === "equal" ? firstOp.oldIndex : 0) + 1;
      const newStart = (firstOp.kind === "equal" ? firstOp.newIndex : 0) + 1;
      out[out.length - 1] = {
        opStart: previous.opStart,
        opEnd: next.opEnd,
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: mergedLines,
      };
    } else {
      out.push(next);
    }
  }
  return out;
}

function renderRawHunk(raw: RawHunk): DiffHunk {
  const lines: string[] = [];
  for (const op of raw.lines) {
    if (op.kind === "equal") lines.push(` ${op.text}`);
    else if (op.kind === "delete") lines.push(`-${op.text}`);
    else lines.push(`+${op.text}`);
  }
  return {
    oldStart: raw.oldStart,
    oldLines: raw.oldLines,
    newStart: raw.newStart,
    newLines: raw.newLines,
    lines,
  };
}

function buildLineEditScript(
  oldLines: ReadonlyArray<string>,
  newLines: ReadonlyArray<string>,
): LineOp[] {
  const m = oldLines.length;
  const n = newLines.length;
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        lcs[i]![j] = (lcs[i + 1]?.[j + 1] ?? 0) + 1;
      } else {
        const down = lcs[i + 1]?.[j] ?? 0;
        const right = lcs[i]?.[j + 1] ?? 0;
        lcs[i]![j] = down >= right ? down : right;
      }
    }
  }
  const ops: LineOp[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ kind: "equal", oldIndex: i, newIndex: j, text: oldLines[i]! });
      i++;
      j++;
    } else if ((lcs[i + 1]?.[j] ?? 0) >= (lcs[i]?.[j + 1] ?? 0)) {
      ops.push({ kind: "delete", oldIndex: i, text: oldLines[i]! });
      i++;
    } else {
      ops.push({ kind: "insert", newIndex: j, text: newLines[j]! });
      j++;
    }
  }
  while (i < m) {
    ops.push({ kind: "delete", oldIndex: i, text: oldLines[i]! });
    i++;
  }
  while (j < n) {
    ops.push({ kind: "insert", newIndex: j, text: newLines[j]! });
    j++;
  }
  return ops;
}

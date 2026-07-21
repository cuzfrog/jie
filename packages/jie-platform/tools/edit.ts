import { readFileSync, statSync, writeFileSync } from "node:fs";
import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError, type JiePlatformErrorCode } from "../jie-platform-errors";
import { mapErrno, resolveWithinWorkspace } from "./path-utils";

const DIFF_LINE_LIMIT = 5_000;

const EDIT_DESCRIPTION = `Search-and-replace inside a text file. Reads \`path\` (relative to workspace root, or
absolute within workspace), replaces occurrences of \`old_string\` with \`new_string\`, and writes the
result back. If \`old_string\` does not appear the call fails with NO_MATCH. If it appears more
than once and \`replace_all\` is false the call fails with AMBIGUOUS_MATCH (so the model must
either narrow \`old_string\` or opt in to \`replace_all\`). On success returns a unified-diff preview
in \`details.diff\` for the TUI to render; for edits larger than ${DIFF_LINE_LIMIT} lines the diff is
omitted and \`details.diff\` is null (use \`write_file\` for wholesale rewrites). Text only; UTF-8.`;

interface EditDeps {
  workspaceRoot: string;
}

const ERRNO_MAP: Record<string, JiePlatformErrorCode> = {
  ENOENT: "FILE_NOT_FOUND",
  ENOTDIR: "PATH_ESCAPE",
  EACCES: "PERMISSION_DENIED",
  EISDIR: "IS_A_DIRECTORY",
  EIO: "IO_ERROR",
  ENOSPC: "DISK_FULL",
};

interface EditInput {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface EditResultDetails {
  readonly kind: "diff";
  readonly path: string;
  readonly replacementsCount: number;
  readonly beforeBytes: number;
  readonly afterBytes: number;
  readonly diff: string | null;
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

export function createEditTool(dependencies: EditDeps): Tool<EditInput> {
  return {
    name: "edit",
    description: EDIT_DESCRIPTION,
    label: "Edit File",
    parameters: Type.Object({
      path: Type.String(),
      old_string: Type.String(),
      new_string: Type.String(),
      replace_all: Type.Optional(Type.Boolean()),
    }),
    async execute(input: EditInput): Promise<ToolResult> {
      const realPath = resolveWithinWorkspace(input.path, dependencies.workspaceRoot);
      let stat;
      try {
        stat = statSync(realPath);
      } catch (error) {
        throw mapErrno(error, ERRNO_MAP);
      }
      if (stat.isDirectory()) {
        throw new JiePlatformError("IS_A_DIRECTORY", { detail: input.path });
      }

      const bytes = new Uint8Array(readFileSync(realPath));
      let before: string;
      try {
        before = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        throw new JiePlatformError("UNSUPPORTED_ENCODING", { detail: input.path });
      }

      const replaceAll = input.replace_all === true;
      const matches = findAllOccurrences(before, input.old_string);
      if (matches.length === 0) {
        throw new JiePlatformError("NO_MATCH", { detail: input.path });
      }
      if (matches.length > 1 && !replaceAll) {
        throw new JiePlatformError("AMBIGUOUS_MATCH", {
          detail: `${matches.length} matches in ${input.path}`,
        });
      }

      const after = applyReplacements(before, matches, input.old_string, input.new_string, replaceAll);

      try {
        writeFileSync(realPath, after, "utf-8");
      } catch (error) {
        throw mapErrno(error, ERRNO_MAP);
      }

      const replacementsCount = replaceAll ? matches.length : 1;
      const beforeBytes = new TextEncoder().encode(before).length;
      const afterBytes = new TextEncoder().encode(after).length;
      const oldLineCount = countLines(before);
      const newLineCount = countLines(after);
      const diff = oldLineCount > DIFF_LINE_LIMIT || newLineCount > DIFF_LINE_LIMIT
        ? null
        : renderUnifiedDiff(before, after);
      const summary = `Edited ${input.path}: ${replacementsCount} replacement${replacementsCount === 1 ? "" : "s"}`;
      const content = diff === null || diff === "" ? summary : `${summary}\n${diff}`;
      const details: EditResultDetails = {
        kind: "diff",
        path: input.path,
        replacementsCount,
        beforeBytes,
        afterBytes,
        diff,
      };

      return { content, details };
    },
  };
}

function findAllOccurrences(haystack: string, needle: string): number[] {
  if (needle.length === 0) return [];
  const out: number[] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    out.push(index);
    index = haystack.indexOf(needle, index + needle.length);
  }
  return out;
}

function applyReplacements(
  before: string,
  matches: ReadonlyArray<number>,
  needle: string,
  replacement: string,
  replaceAll: boolean,
): string {
  const useMatches = replaceAll ? matches : matches.slice(0, 1);
  const parts: string[] = [];
  let cursor = 0;
  for (const matchIndex of useMatches) {
    parts.push(before.substring(cursor, matchIndex));
    parts.push(replacement);
    cursor = matchIndex + needle.length;
  }
  parts.push(before.substring(cursor));
  return parts.join("");
}

function countLines(text: string): number {
  if (text === "") return 0;
  return text.split("\n").length;
}

type LineOp = { kind: "equal"; oldIndex: number; newIndex: number; text: string }
  | { kind: "delete"; oldIndex: number; text: string }
  | { kind: "insert"; newIndex: number; text: string };

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function renderUnifiedDiff(before: string, after: string): string {
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
      out[out.length - 1] = toRawHunk(
        previous.lines.concat(next.lines),
        0,
        previous.lines.length + next.lines.length,
      );
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

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError, type JiePlatformErrorCode } from "../jie-platform-errors";
import { mapErrno, resolveWithinWorkspace } from "./path-utils";
import { renderUnifiedDiff } from "./unified-diff";

const EDIT_DESCRIPTION = `Search-and-replace inside a text file. Reads \`path\` (relative to workspace root, or
absolute within workspace) and applies every entry of \`edits\`: each \`{old_string, new_string}\`
pair is matched against the original file content — not against the result of earlier entries —
and must occur exactly once unless \`replace_all\` is true; entries must not overlap each other's
matches. Any violation fails the whole call with NO_MATCH, AMBIGUOUS_MATCH, or OVERLAPPING_EDITS
and leaves the file untouched. On success returns a one-line ack; the unified-diff preview lives
only in \`details.diff\` for the UI — it is not part of the model-visible result. For edits larger
than 5000 lines the diff is omitted and \`details.diff\` is null (use \`write_file\` for wholesale
rewrites). Text only; UTF-8.`;

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

interface EditReplacement {
  old_string: string;
  new_string: string;
}

interface EditInput {
  path: string;
  edits: ReadonlyArray<EditReplacement>;
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

export function createEditTool(dependencies: EditDeps): Tool<EditInput> {
  return {
    name: "edit",
    description: EDIT_DESCRIPTION,
    label: "Edit File",
    parameters: Type.Object({
      path: Type.String(),
      edits: Type.Array(
        Type.Object({
          old_string: Type.String(),
          new_string: Type.String(),
        }),
        { minItems: 1 },
      ),
      replace_all: Type.Optional(Type.Boolean()),
    }),
    prepareArguments(rawInput: unknown): unknown {
      if (rawInput === null || typeof rawInput !== "object") return rawInput;
      const args = rawInput as Record<string, unknown>;
      if (Array.isArray(args.edits)) return args;
      if (typeof args.edits === "string") {
        try {
          const parsed: unknown = JSON.parse(args.edits);
          if (Array.isArray(parsed)) {
            return { path: args.path, edits: parsed, replace_all: args.replace_all };
          }
        } catch {
          return args;
        }
      }
      if (typeof args.old_string === "string" && typeof args.new_string === "string") {
        return {
          path: args.path,
          edits: [{ old_string: args.old_string, new_string: args.new_string }],
          replace_all: args.replace_all,
        };
      }
      return args;
    },
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
      let decoded: string;
      try {
        decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        throw new JiePlatformError("UNSUPPORTED_ENCODING", { detail: input.path });
      }

      const bom = decoded.startsWith("\uFEFF") ? "\uFEFF" : "";
      const raw = decoded.slice(bom.length);
      const lineEnding = detectLineEnding(raw);
      const before = normalizeToLF(raw);
      const replaceAll = input.replace_all === true;
      const edits = input.edits.map((edit) => ({
        needle: normalizeToLF(edit.old_string),
        replacement: normalizeToLF(edit.new_string),
      }));
      const spans = matchEdits(before, edits, input.path, replaceAll);
      const edited = applySpans(before, spans);
      const after = bom + restoreLineEndings(edited, lineEnding);

      try {
        writeFileSync(realPath, after, "utf-8");
      } catch (error) {
        throw mapErrno(error, ERRNO_MAP);
      }

      const replacementsCount = spans.length;
      const beforeBytes = new TextEncoder().encode(decoded).length;
      const afterBytes = new TextEncoder().encode(after).length;
      const diff = renderUnifiedDiff(before, edited);
      const content = `Edited ${input.path}: ${replacementsCount} replacement${replacementsCount === 1 ? "" : "s"}`;
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

interface ReplacementSpan {
  readonly editIndex: number;
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}

function matchEdits(
  content: string,
  edits: ReadonlyArray<{ needle: string; replacement: string }>,
  path: string,
  replaceAll: boolean,
): ReplacementSpan[] {
  const spans: ReplacementSpan[] = [];
  for (let editIndex = 0; editIndex < edits.length; editIndex++) {
    const edit = edits[editIndex]!;
    const matches = findAllOccurrences(content, edit.needle);
    if (matches.length === 0) {
      throw new JiePlatformError("NO_MATCH", { detail: editLocation(path, editIndex, edits.length) });
    }
    if (matches.length > 1 && !replaceAll) {
      throw new JiePlatformError("AMBIGUOUS_MATCH", {
        detail: `${matches.length} matches in ${editLocation(path, editIndex, edits.length)}`,
      });
    }
    for (const matchIndex of matches) {
      spans.push({ editIndex, start: matchIndex, end: matchIndex + edit.needle.length, replacement: edit.replacement });
    }
  }
  spans.sort((a, b) => a.start - b.start);
  for (let index = 1; index < spans.length; index++) {
    const previous = spans[index - 1]!;
    const current = spans[index]!;
    if (current.start < previous.end) {
      throw new JiePlatformError("OVERLAPPING_EDITS", {
        detail: `edits[${previous.editIndex}] and edits[${current.editIndex}] in ${path}`,
      });
    }
  }
  return spans;
}

function applySpans(before: string, spans: ReadonlyArray<ReplacementSpan>): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const span of spans) {
    parts.push(before.substring(cursor, span.start));
    parts.push(span.replacement);
    cursor = span.end;
  }
  parts.push(before.substring(cursor));
  return parts.join("");
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

function editLocation(path: string, editIndex: number, total: number): string {
  return total === 1 ? path : `edits[${editIndex}] of ${path}`;
}

function detectLineEnding(content: string): "\r\n" | "\n" {
  const crlfIndex = content.indexOf("\r\n");
  const lfIndex = content.indexOf("\n");
  if (lfIndex === -1 || crlfIndex === -1) return "\n";
  return crlfIndex < lfIndex ? "\r\n" : "\n";
}

function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function restoreLineEndings(text: string, ending: "\r\n" | "\n"): string {
  return ending === "\r\n" ? text.replace(/\n/g, "\r\n") : text;
}

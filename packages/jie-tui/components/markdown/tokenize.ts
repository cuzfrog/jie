export interface InlineRun {
  readonly text: string;
  readonly em?: boolean;
  readonly strong?: boolean;
  readonly code?: boolean;
  readonly href?: string;
  readonly br?: boolean;
}

export type MarkdownBlock =
  | { readonly kind: "paragraph"; readonly text: string; readonly runs: ReadonlyArray<InlineRun> }
  | {
      readonly kind: "heading";
      readonly level: 1 | 2 | 3 | 4 | 5 | 6;
      readonly text: string;
      readonly runs: ReadonlyArray<InlineRun>;
    }
  | { readonly kind: "codeBlock"; readonly lang: string | null; readonly text: string }
  | { readonly kind: "blockquote"; readonly text: string; readonly runs: ReadonlyArray<InlineRun> }
  | { readonly kind: "hr" }
  | {
      readonly kind: "list";
      readonly ordered: boolean;
      readonly items: ReadonlyArray<string>;
      readonly itemRuns: ReadonlyArray<ReadonlyArray<InlineRun>>;
      readonly children: ReadonlyArray<ReadonlyArray<string>>;
      readonly childrenRuns: ReadonlyArray<ReadonlyArray<ReadonlyArray<InlineRun>>>;
    }
  | {
      readonly kind: "table";
      readonly header: ReadonlyArray<string>;
      readonly headerRuns: ReadonlyArray<ReadonlyArray<InlineRun>>;
      readonly rows: ReadonlyArray<ReadonlyArray<string>>;
      readonly rowRuns: ReadonlyArray<ReadonlyArray<ReadonlyArray<InlineRun>>>;
      readonly aligns: ReadonlyArray<"left" | "right" | "center" | "none">;
    };

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const UL_RE = /^([ \t]{0,3})[-*+]\s+(.*)$/;
const OL_RE = /^([ \t]{0,3})\d+\.\s+(.*)$/;
const HR_RE = /^([ \t]{0,3})([-*_])(?:[ \t]*\2){2,}[ \t]*$/;
const FENCE_RE = /^([ \t]{0,3})(`{3,}|~{3,})\s*([^\s`~]*)\s*$/;
const BLOCKQUOTE_RE = /^[ \t]{0,3}>[ \t]?(.*)$/;
const TABLE_SEP_RE = /^[ \t]{0,3}\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;

export function tokenize(source: string): ReadonlyArray<MarkdownBlock> {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const out: MarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (line.match(UL_RE) || line.match(OL_RE)) {
      i = parseList(lines, i, out, line.match(OL_RE) !== null);
      continue;
    }
    const fence = line.match(FENCE_RE);
    if (fence) {
      const open = fence[2]!;
      const lang = fence[3] ?? "";
      const start = i + 1;
      let end = start;
      while (end < lines.length) {
        const closing = lines[end]!;
        if (closing.match(/^[ \t]{0,3}(`{3,}|~{3,})\s*$/)) {
          const closeMark = closing.match(/^[ \t]{0,3}(`{3,}|~{3,})/)![1]!;
          if (closeMark[0] === open[0] && closeMark.length >= open.length) break;
        }
        end += 1;
      }
      const blockLines = lines.slice(start, end);
      while (blockLines.length > 0 && blockLines[blockLines.length - 1] === "") {
        blockLines.pop();
      }
      const text = blockLines.join("\n");
      out.push({ kind: "codeBlock", lang: lang === "" ? null : lang, text });
      i = end + 1;
      continue;
    }
    const heading = line.match(HEADING_RE);
    if (heading) {
      const level = heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6;
      const text = heading[2]!.trim();
      out.push({ kind: "heading", level, text, runs: parseInline(text) });
      i += 1;
      continue;
    }
    if (i + 1 < lines.length && isTableHeaderLine(line, lines[i + 1]!)) {
      i = parseTable(lines, i, out);
      continue;
    }
    const ol = line.match(OL_RE);
    if (ol && i + 1 < lines.length) {
      const next = lines[i + 1]!;
      if (next.match(/^[ \t]*([-:]\s*){3,}$/)) {
        i = parseTable(lines, i, out);
        continue;
      }
    }
    if (line.match(HR_RE) && (line.match(/^---/) || line.match(/^\*\*\*/) || line.match(/^___/))) {
      out.push({ kind: "hr" });
      i += 1;
      continue;
    }
    const bq = line.match(BLOCKQUOTE_RE);
    if (bq) {
      const buf: string[] = [bq[1]!];
      let j = i + 1;
      while (j < lines.length) {
        const m = lines[j]!.match(BLOCKQUOTE_RE);
        if (m === null) break;
        buf.push(m[1]!);
        j += 1;
      }
      const text = buf.join("\n");
      out.push({ kind: "blockquote", text, runs: parseInline(text) });
      i = j;
      continue;
    }
    if (ol || line.match(UL_RE)) {
      i = parseList(lines, i, out, ol !== null);
      continue;
    }
    i = parseParagraph(lines, i, out);
  }
  return out;
}

function isTableHeaderLine(headerLine: string, sepLine: string): boolean {
  if (!headerLine.match(/\|/)) return false;
  return sepLine.match(TABLE_SEP_RE) !== null;
}

function parseTable(
  lines: ReadonlyArray<string>,
  start: number,
  out: MarkdownBlock[],
): number {
  const headerLine = lines[start]!.replace(/^\|/, "").replace(/\|$/, "");
  const header = headerLine.split("|").map((c) => c.trim());
  const sep = lines[start + 1]!;
  const sepCells = sep.replace(/^\|/, "").replace(/\|$/, "").split("|");
  if (!sepCells.every((c) => /^\s*:?-+:?\s*$/.test(c))) return start + 1;
  const aligns: ("left" | "right" | "center" | "none")[] = sepCells.map((c) => {
    const t = c.trim();
    const left = t.startsWith(":");
    const right = t.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "none";
  });
  const rows: string[][] = [];
  const rowRuns: ReadonlyArray<InlineRun>[][] = [];
  let j = start + 2;
  while (j < lines.length) {
    const ln = lines[j]!;
    if (ln.trim() === "") break;
    if (!ln.match(/\|/)) break;
    const cells = ln.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    rows.push(cells);
    rowRuns.push(cells.map((c) => parseInline(c)));
    j += 1;
  }
  out.push({
    kind: "table",
    header,
    headerRuns: header.map((c) => parseInline(c)),
    rows,
    rowRuns,
    aligns,
  });
  return j;
}

function parseList(
  lines: ReadonlyArray<string>,
  start: number,
  out: MarkdownBlock[],
  ordered: boolean,
): number {
  const items: string[] = [];
  const itemRuns: ReadonlyArray<InlineRun>[] = [];
  const children: string[][] = [];
  const childrenRuns: ReadonlyArray<ReadonlyArray<InlineRun>>[] = [];
  let j = start;
  while (j < lines.length) {
    const ln = lines[j]!;
    if (ln.trim() === "") break;
    const ol = ln.match(OL_RE);
    const ul = ln.match(UL_RE);
    const isMarker = (ol !== null) === (ul !== null) ? false : ol !== null || ul !== null;
    if (!isMarker) {
      const indentMatch = ln.match(/^([ \t]*)/);
      const indent = indentMatch ? indentMatch[1]!.length : 0;
      if (indent >= 2 && items.length > 0) {
        const last = items.length - 1;
        const appended = items[last]! + "\n" + ln.trim();
        items[last] = appended;
        itemRuns[last] = parseInline(appended);
        j += 1;
        continue;
      }
      break;
    }
    if ((ol !== null) !== ordered) break;
    const indentMatch = ln.match(/^([ \t]*)/);
    const indent = indentMatch ? indentMatch[1]!.length : 0;
    if (indent >= 2) {
      const childItems: string[] = [];
      const childRuns: ReadonlyArray<InlineRun>[] = [];
      while (j < lines.length) {
        const cln = lines[j]!;
        if (cln.trim() === "") break;
        const col = cln.match(OL_RE);
        const cul = cln.match(UL_RE);
        if (!col && !cul) break;
        if ((col === null) === (cul === null)) break;
        const cindentMatch = cln.match(/^([ \t]*)/);
        const cindent = cindentMatch ? cindentMatch[1]!.length : 0;
        if (cindent < 2) break;
        const content = col ? col[2]! : cul![2]!;
        childItems.push(content);
        childRuns.push(parseInline(content));
        j += 1;
      }
      children[children.length === 0 ? 0 : children.length - 1] = childItems;
      childrenRuns[childrenRuns.length === 0 ? 0 : childrenRuns.length - 1] = childRuns;
      continue;
    }
    const content = ol ? ol[2]! : ul![2]!;
    items.push(content);
    itemRuns.push(parseInline(content));
    children.push([]);
    childrenRuns.push([]);
    j += 1;
  }
  out.push({ kind: "list", ordered, items, itemRuns, children, childrenRuns });
  return j;
}

function parseParagraph(
  lines: ReadonlyArray<string>,
  start: number,
  out: MarkdownBlock[],
): number {
  const buf: string[] = [lines[start]!];
  let j = start + 1;
  while (j < lines.length) {
    const ln = lines[j]!;
    if (ln.trim() === "") break;
    if (ln.match(FENCE_RE)) break;
    if (ln.match(HEADING_RE)) break;
    if (ln.match(UL_RE) || ln.match(OL_RE)) break;
    if (ln.match(HR_RE)) break;
    if (ln.match(BLOCKQUOTE_RE)) break;
    if (ln.match(/^---$/) && j + 1 < lines.length) break;
    if (ln.match(/^===\s*$/) && buf.length > 0) break;
    buf.push(ln);
    j += 1;
  }
  if (j + 1 < lines.length) {
    const next = lines[j]!;
    if (next.match(/^===\s*$/) && buf.length > 0) {
      const text = buf.join(" ");
      out.push({ kind: "heading", level: 1, text, runs: parseInline(text) });
      return j + 1;
    }
  }
  if (j + 1 < lines.length) {
    const next = lines[j]!;
    if (next.match(/^---\s*$/) && buf.length > 0) {
      const text = buf.join(" ");
      out.push({ kind: "heading", level: 2, text, runs: parseInline(text) });
      return j + 1;
    }
  }
  const text = buf.join(" ");
  const runs = parseParagraphRuns(buf);
  out.push({ kind: "paragraph", text, runs });
  return j;
}

function parseParagraphRuns(buf: ReadonlyArray<string>): ReadonlyArray<InlineRun> {
  const runs: InlineRun[] = [];
  for (let k = 0; k < buf.length; k += 1) {
    const line = buf[k]!;
    if (k > 0) {
      const prev = buf[k - 1]!;
      if (prev.endsWith("  ")) {
        runs.push({ text: " ", br: true });
      } else {
        runs.push({ text: " " });
      }
    }
    const inline = parseInline(line);
    for (const r of inline) runs.push(r);
  }
  return runs;
}

export function parseInline(text: string): ReadonlyArray<InlineRun> {
  const out: InlineRun[] = [];
  let i = 0;
  let buf = "";
  const flush = (): void => {
    if (buf.length > 0) {
      out.push({ text: buf });
      buf = "";
    }
  };
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "\\" && i + 1 < text.length) {
      buf += text[i + 1]!;
      i += 2;
      continue;
    }
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        out.push({ text: text.slice(i + 1, end), code: true });
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const close = text.indexOf("]", i + 1);
      if (close !== -1 && text[close + 1] === "(") {
        const hrefEnd = text.indexOf(")", close + 2);
        if (hrefEnd !== -1) {
          flush();
          out.push({ text: text.slice(i + 1, close), href: text.slice(close + 2, hrefEnd) });
          i = hrefEnd + 1;
          continue;
        }
      }
    }
    if (ch === "*" || ch === "_") {
      const marker = ch;
      const triple = text[i + 1] === marker && text[i + 2] === marker && text[i + 3] !== marker;
      if (triple) {
        const endIdx = findTripleClose(text, i + 3, marker);
        if (endIdx !== -1) {
          flush();
          out.push({ text: text.slice(i + 3, endIdx), em: true, strong: true });
          i = endIdx + 3;
          continue;
        }
      }
      if (text[i + 1] === marker) {
        const endIdx = findClose(text, i + 2, marker);
        if (endIdx !== -1) {
          flush();
          out.push({ text: text.slice(i + 2, endIdx), strong: true });
          i = endIdx + 2;
          continue;
        }
      }
      const endIdx = findClose(text, i + 1, marker);
      if (endIdx !== -1 && endIdx > i + 1) {
        flush();
        out.push({ text: text.slice(i + 1, endIdx), em: true });
        i = endIdx + 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return mergeAdjacentCode(out);
}

function findClose(text: string, from: number, marker: string): number {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] === marker) return i;
    if (text[i] === "\n") return -1;
  }
  return -1;
}

function findTripleClose(text: string, from: number, marker: string): number {
  for (let i = from; i < text.length - 2; i += 1) {
    if (text[i] === marker && text[i + 1] === marker && text[i + 2] === marker) return i;
    if (text[i] === "\n") return -1;
  }
  return -1;
}

function mergeAdjacentCode(runs: ReadonlyArray<InlineRun>): ReadonlyArray<InlineRun> {
  const out: InlineRun[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last !== undefined && last.code && r.code) {
      out[out.length - 1] = { ...last, text: last.text + r.text };
    } else {
      out.push(r);
    }
  }
  return out;
}

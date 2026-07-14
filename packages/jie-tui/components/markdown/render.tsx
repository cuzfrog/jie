import { Box, Text } from "@cuzfrog/jie-ink";
import type { JSX } from "react";
import { pickColor } from "../themes";
import { formatOsc8 } from "./osc8";
import { tokenize, type InlineRun, type MarkdownBlock } from "./tokenize";

export interface MarkdownStyle {
  readonly textColor?: string;
  readonly italic?: boolean;
}

export interface MarkdownProps {
  readonly source: string;
  readonly prefix?: { readonly text: string; readonly color: string };
  readonly style?: MarkdownStyle;
}

export function Markdown({ source, prefix, style }: MarkdownProps): JSX.Element {
  const blocks = tokenize(source);
  return (
    <Box flexDirection="column">
      {blocks.map((block, i) => (
        <BlockNode
          key={`b-${i}`}
          block={block}
          prefix={i === 0 ? prefix : undefined}
          style={style}
        />
      ))}
    </Box>
  );
}

interface BlockNodeProps {
  readonly block: MarkdownBlock;
  readonly prefix?: { readonly text: string; readonly color: string };
  readonly style?: MarkdownStyle;
}

function BlockNode({ block, prefix, style }: BlockNodeProps): JSX.Element {
  switch (block.kind) {
    case "paragraph":
      return <ParagraphNode runs={block.runs} prefix={prefix} style={style} />;
    case "heading":
      return <HeadingNode level={block.level} runs={block.runs} prefix={prefix} style={style} />;
    case "codeBlock":
      return <CodeBlockNode lang={block.lang} text={block.text} style={style} />;
    case "blockquote":
      return <BlockquoteNode runs={block.runs} style={style} />;
    case "hr":
      return <Text color={pickColor("muted")}>{"─".repeat(40)}</Text>;
    case "list":
      return <ListNode block={block} style={style} />;
    case "table":
      return <TableNode block={block} style={style} />;
  }
}

function ParagraphNode({
  runs,
  prefix,
  style,
}: {
  readonly runs: ReadonlyArray<InlineRun>;
  readonly prefix?: { readonly text: string; readonly color: string };
  readonly style?: MarkdownStyle;
}): JSX.Element {
  const baseColor = style?.textColor ?? pickColor("text");
  return (
    <Text color={baseColor} italic={style?.italic === true}>
      {prefix !== undefined ? <Text color={prefix.color}>{prefix.text}</Text> : null}
      <InlineRuns runs={runs} style={style} />
    </Text>
  );
}

function HeadingNode({
  level,
  runs,
  prefix,
  style,
}: {
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly runs: ReadonlyArray<InlineRun>;
  readonly prefix?: { readonly text: string; readonly color: string };
  readonly style?: MarkdownStyle;
}): JSX.Element {
  const headingPrefix = level === 1 ? "# " : "## ";
  const color = style?.textColor ?? pickColor("accent");
  return (
    <Text color={color} bold italic={style?.italic === true}>
      {prefix !== undefined ? <Text color={prefix.color}>{prefix.text}</Text> : null}
      {headingPrefix}
      <InlineRuns runs={runs} style={style} />
    </Text>
  );
}

function CodeBlockNode({
  lang,
  text,
  style,
}: {
  readonly lang: string | null;
  readonly text: string;
  readonly style?: MarkdownStyle;
}): JSX.Element {
  const lines = text.split("\n");
  const baseColor = style?.textColor ?? pickColor("success");
  return (
    <Box flexDirection="column" paddingX={1}>
      {lang !== null ? <Text color={pickColor("muted")}>{`  ${lang}`}</Text> : null}
      {lines.map((line, i) => (
        <Text key={`l-${i}`} color={baseColor}>
          {`  ${line}`}
        </Text>
      ))}
    </Box>
  );
}

function BlockquoteNode({
  runs,
  style,
}: {
  readonly runs: ReadonlyArray<InlineRun>;
  readonly style?: MarkdownStyle;
}): JSX.Element {
  const color = style?.textColor ?? pickColor("muted");
  return (
    <Text color={color} italic>
      {`│ `}
      <InlineRuns runs={runs} style={style} />
    </Text>
  );
}

function ListNode({
  block,
  style,
}: {
  readonly block: Extract<MarkdownBlock, { kind: "list" }>;
  readonly style?: MarkdownStyle;
}): JSX.Element {
  const baseColor = style?.textColor ?? pickColor("text");
  const bulletColor = style?.textColor ?? (block.ordered ? pickColor("text") : pickColor("accent"));
  return (
    <Box flexDirection="column">
      {block.items.map((_item, i) => {
        const bullet = block.ordered ? `${i + 1}. ` : "- ";
        const childItems = block.children[i] ?? [];
        const childRuns = block.childrenRuns[i] ?? [];
        return (
          <Box key={`li-${i}`} flexDirection="column">
            <Text color={baseColor}>
              <Text color={bulletColor}>{bullet}</Text>
              <InlineRuns runs={block.itemRuns[i] ?? []} style={style} />
            </Text>
            {childItems.length > 0 ? (
              <Box flexDirection="column" paddingLeft={2}>
                {childItems.map((_c, j) => (
                  <Text key={`c-${i}-${j}`} color={baseColor}>
                    <Text color={bulletColor}>{"- "}</Text>
                    <InlineRuns runs={childRuns[j] ?? []} style={style} />
                  </Text>
                ))}
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

function TableNode({
  block,
  style,
}: {
  readonly block: Extract<MarkdownBlock, { kind: "table" }>;
  readonly style?: MarkdownStyle;
}): JSX.Element {
  const headerColor = style?.textColor ?? pickColor("accent");
  const rowColor = style?.textColor ?? pickColor("text");
  return (
    <Box flexDirection="column">
      <Text color={headerColor}>
        <TableRow runs={block.headerRuns} style={style} />
      </Text>
      <Text color={pickColor("muted")}>{"─".repeat(block.headerRuns.length * 4 + 12)}</Text>
      {block.rowRuns.map((rowRuns, i) => (
        <Text key={`r-${i}`} color={rowColor}>
          <TableRow runs={rowRuns} style={style} />
        </Text>
      ))}
    </Box>
  );
}

function TableRow({
  runs,
  style,
}: {
  readonly runs: ReadonlyArray<ReadonlyArray<InlineRun>>;
  readonly style?: MarkdownStyle;
}): JSX.Element {
  return (
    <>
      {runs.map((cellRuns, j) => (
        <Text key={`c-${j}`}>
          <InlineRuns runs={cellRuns} style={style} />
          {j < runs.length - 1 ? "  |  " : ""}
        </Text>
      ))}
    </>
  );
}

function InlineRuns({
  runs,
  style,
}: {
  readonly runs: ReadonlyArray<InlineRun>;
  readonly style?: MarkdownStyle;
}): JSX.Element {
  return (
    <>
      {runs.map((run, i) => (
        <InlineRunNode key={`r-${i}`} run={run} style={style} />
      ))}
    </>
  );
}

function InlineRunNode({
  run,
  style,
}: {
  readonly run: InlineRun;
  readonly style?: MarkdownStyle;
}): JSX.Element {
  const overrideColor = style?.textColor;
  const italic = style?.italic === true;
  if (run.code === true) {
    return (
      <Text color={overrideColor ?? pickColor("accent")} italic={italic}>
        {run.text}
      </Text>
    );
  }
  if (run.href !== undefined) {
    return (
      <Text color={overrideColor ?? pickColor("border")} italic={italic} underline>
        {formatOsc8(run.href, run.text)}
      </Text>
    );
  }
  if (run.br === true) {
    return <Text>{"\n"}</Text>;
  }
  const em = run.em === true;
  const strong = run.strong === true;
  if (overrideColor !== undefined) {
    if (strong && em) {
      return <Text color={overrideColor} bold italic>{run.text}</Text>;
    }
    if (strong) {
      return <Text color={overrideColor} bold italic={italic}>{run.text}</Text>;
    }
    if (em) {
      return <Text color={overrideColor} italic>{run.text}</Text>;
    }
    return <Text color={overrideColor} italic={italic}>{run.text}</Text>;
  }
  if (strong && em) {
    return <Text bold italic>{run.text}</Text>;
  }
  if (strong) {
    return <Text bold>{run.text}</Text>;
  }
  if (em) {
    return <Text italic>{run.text}</Text>;
  }
  return <Text>{run.text}</Text>;
}

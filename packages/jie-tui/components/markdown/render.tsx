import { Box, Text } from "@cuzfrog/jie-ink";
import type { JSX } from "react";
import { pickColor } from "../themes";
import { formatOsc8 } from "./osc8";
import { tokenize, type InlineRun, type MarkdownBlock } from "./tokenize";

export interface MarkdownProps {
  readonly source: string;
  readonly prefix?: { readonly text: string; readonly color: string };
}

export function Markdown({ source, prefix }: MarkdownProps): JSX.Element {
  const blocks = tokenize(source);
  return (
    <Box flexDirection="column">
      {blocks.map((block, i) => (
        <BlockNode key={`b-${i}`} block={block} prefix={i === 0 ? prefix : undefined} />
      ))}
    </Box>
  );
}

function BlockNode({ block, prefix }: { readonly block: MarkdownBlock; readonly prefix?: { readonly text: string; readonly color: string } }): JSX.Element {
  switch (block.kind) {
    case "paragraph":
      return <ParagraphNode runs={block.runs} prefix={prefix} />;
    case "heading":
      return <HeadingNode level={block.level} runs={block.runs} prefix={prefix} />;
    case "codeBlock":
      return <CodeBlockNode lang={block.lang} text={block.text} />;
    case "blockquote":
      return <BlockquoteNode runs={block.runs} />;
    case "hr":
      return <Text color={pickColor("muted")}>{"─".repeat(40)}</Text>;
    case "list":
      return <ListNode ordered={block.ordered} items={block.items} />;
    case "table":
      return <TableNode block={block} />;
  }
}

function ParagraphNode({ runs, prefix }: { readonly runs: ReadonlyArray<InlineRun>; readonly prefix?: { readonly text: string; readonly color: string } }): JSX.Element {
  if (prefix === undefined) {
    return (
      <Text color={pickColor("text")}>
        <InlineRuns runs={runs} />
      </Text>
    );
  }
  return (
    <Text color={pickColor("text")}>
      <Text color={prefix.color}>{prefix.text}</Text>
      <InlineRuns runs={runs} />
    </Text>
  );
}

function HeadingNode({ level, runs, prefix }: { readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly runs: ReadonlyArray<InlineRun>; readonly prefix?: { readonly text: string; readonly color: string } }): JSX.Element {
  const headingPrefix = level <= 2 ? "# " : "## ";
  return (
    <Text color={pickColor("accent")} bold>
      {prefix !== undefined ? <Text color={prefix.color}>{prefix.text}</Text> : null}
      {headingPrefix}
      <InlineRuns runs={runs} />
    </Text>
  );
}

function CodeBlockNode({ lang, text }: { readonly lang: string | null; readonly text: string }): JSX.Element {
  const lines = text.split("\n");
  return (
    <Box flexDirection="column" paddingX={1}>
      {lang !== null ? <Text color={pickColor("muted")}>{`  ${lang}`}</Text> : null}
      {lines.map((line, i) => (
        <Text key={`l-${i}`} color={pickColor("success")}>
          {`  ${line}`}
        </Text>
      ))}
    </Box>
  );
}

function BlockquoteNode({ runs }: { readonly runs: ReadonlyArray<InlineRun> }): JSX.Element {
  return (
    <Text color={pickColor("muted")} italic>
      {`│ `}
      <InlineRuns runs={runs} />
    </Text>
  );
}

function ListNode({ ordered, items }: { readonly ordered: boolean; readonly items: ReadonlyArray<string> }): JSX.Element {
  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        const bullet = ordered ? `${i + 1}. ` : "- ";
        const bulletColor = ordered ? pickColor("text") : pickColor("accent");
        return (
          <Text key={`li-${i}`} color={pickColor("text")}>
            <Text color={bulletColor}>{bullet}</Text>
            {item}
          </Text>
        );
      })}
    </Box>
  );
}

function TableNode({ block }: { readonly block: Extract<MarkdownBlock, { kind: "table" }> }): JSX.Element {
  return (
    <Box flexDirection="column">
      <Text color={pickColor("accent")}>
        {block.header.map((c) => c).join("  |  ")}
      </Text>
      <Text color={pickColor("muted")}>{"─".repeat(20)}</Text>
      {block.rows.map((row, i) => (
        <Text key={`r-${i}`} color={pickColor("text")}>
          {row.join("  |  ")}
        </Text>
      ))}
    </Box>
  );
}

function InlineRuns({ runs }: { readonly runs: ReadonlyArray<InlineRun> }): JSX.Element {
  return (
    <>
      {runs.map((run, i) => (
        <InlineRunNode key={`r-${i}`} run={run} />
      ))}
    </>
  );
}

function InlineRunNode({ run }: { readonly run: InlineRun }): JSX.Element {
  if (run.code === true) {
    return (
      <Text color={pickColor("accent")}>
        {`\`${run.text}\``}
      </Text>
    );
  }
  if (run.href !== undefined) {
    return (
      <Text color={pickColor("border")} underline>
        {formatOsc8(run.href, run.text)}
      </Text>
    );
  }
  if (run.br === true) {
    return <Text>{"\n"}</Text>;
  }
  const em = run.em === true;
  const strong = run.strong === true;
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

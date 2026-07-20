import { Box } from "@cuzfrog/jie-ink";
import type { MessageBlock } from "../../state";
import { measureMarkdown } from "../markdown";
import { render } from "../../test-renderer";
import { TextBlock } from "./text-block";

const BLOCK_WIDTH = 20;
const INNER_WIDTH = BLOCK_WIDTH - 2;
const ASSISTANT_PREFIX_TEXT = "● ";
const THINKING_PREFIX_TEXT = "◆ ";

interface ParityCase {
  readonly name: string;
  readonly text: string;
  readonly kind: "text" | "thinking";
  readonly expanded: boolean;
}

const CASES: ReadonlyArray<ParityCase> = [
  { name: "short paragraph", text: "hello", kind: "text", expanded: false },
  { name: "paragraph wraps across rows", text: "a".repeat(50), kind: "text", expanded: false },
  { name: "newline-joined lines merge like the renderer", text: thirtyJoinedLines(), kind: "text", expanded: false },
  { name: "blank line splits paragraphs", text: "a\n\nb", kind: "text", expanded: false },
  { name: "hard break forces a new row", text: "a  \nb", kind: "text", expanded: false },
  { name: "h1 heading plus paragraph", text: "# H1\n\nbody", kind: "text", expanded: false },
  { name: "h3 heading repeats the hash per level", text: "### deep", kind: "text", expanded: false },
  { name: "code block with lang", text: "```ts\nfoo\nbar\n```", kind: "text", expanded: false },
  { name: "code line wraps inside the padded box", text: "```\n" + "a".repeat(30) + "\n```", kind: "text", expanded: false },
  { name: "bullet list", text: "- a\n- b\n- c", kind: "text", expanded: false },
  { name: "ordered item wraps past the bullet", text: `1. ${"a".repeat(17)}`, kind: "text", expanded: false },
  { name: "nested list", text: "- a\n  - b", kind: "text", expanded: false },
  { name: "blockquote keeps a row per source line", text: "> x\n> y", kind: "text", expanded: false },
  { name: "horizontal rule wraps at inner width", text: "---", kind: "text", expanded: false },
  { name: "table", text: "| a | b |\n| --- | --- |\n| 1 | 2 |", kind: "text", expanded: false },
  { name: "aligned table pads cells", text: "| num | mid |\n| ---: | :-: |\n| 12 | x |", kind: "text", expanded: false },
  { name: "expanded thinking merges lines", text: "t1\nt2", kind: "thinking", expanded: true },
];

describe("measureMarkdown matches what TextBlock paints", () => {
  for (const c of CASES) {
    test(c.name, () => {
      const block: MessageBlock = { kind: c.kind, text: c.text };
      const { lastFrame, unmount } = render(
        <Box flexDirection="column" width={BLOCK_WIDTH}>
          <TextBlock block={block} expanded={c.expanded} />
        </Box>,
      );
      const frame = lastFrame() ?? "";
      const painted = frame === "" ? 0 : frame.split("\n").length;
      unmount();
      const prefix = c.kind === "thinking" ? THINKING_PREFIX_TEXT : ASSISTANT_PREFIX_TEXT;
      expect(painted).toBe(measureMarkdown(c.text, INNER_WIDTH, prefix));
    });
  }
});

function thirtyJoinedLines(): string {
  return Array.from({ length: 30 }, (_, i) => `c${String(i + 1).padStart(2, "0")}`).join("\n");
}

import type { JSX } from "react";
import { Box, Text } from "@cuzfrog/jie-ink";
import { pickColor } from "../themes";

interface DiffViewProps {
  readonly diff: string;
}

interface ParsedLine {
  readonly kind: "add" | "del" | "ctx" | "meta";
  readonly prefix: string;
  readonly text: string;
}

export function DiffView({ diff }: DiffViewProps): JSX.Element {
  if (diff === "") return <Text color={pickColor("muted")}>(no textual diff)</Text>;
  const lines = parseDiff(diff);
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <DiffLine key={index} line={line} />
      ))}
    </Box>
  );
}

function DiffLine({ line }: { readonly line: ParsedLine }): JSX.Element {
  if (line.kind === "meta") return <Text color={pickColor("muted")}>{line.prefix}{line.text}</Text>;
  const colorName = line.kind === "add" ? "success" : line.kind === "del" ? "error" : "text";
  return (
    <Text>
      <Text color={pickColor(colorName)}>{line.prefix}</Text>
      <Text color={pickColor(colorName)}>{line.text}</Text>
    </Text>
  );
}

function parseDiff(diff: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  for (const raw of diff.split("\n")) {
    if (raw.startsWith("@@")) {
      out.push({ kind: "meta", prefix: "", text: raw });
    } else if (raw.startsWith("+")) {
      out.push({ kind: "add", prefix: "+", text: raw.substring(1) });
    } else if (raw.startsWith("-")) {
      out.push({ kind: "del", prefix: "-", text: raw.substring(1) });
    } else if (raw.startsWith(" ")) {
      out.push({ kind: "ctx", prefix: " ", text: raw.substring(1) });
    } else {
      out.push({ kind: "ctx", prefix: "", text: raw });
    }
  }
  return out;
}

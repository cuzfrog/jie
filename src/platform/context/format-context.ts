import type { ContextFile } from "./types";

export function formatContextFilesForPrompt(files: ReadonlyArray<ContextFile>): string {
  if (files.length === 0) return "";

  const lines = [
    "The following project context files were loaded automatically. Treat their instructions as authoritative for this workspace.",
    "",
    "<context_files>",
  ];
  for (const file of files) {
    lines.push(`  <context_file path="${escapeXml(file.path)}">`);
    lines.push(file.content.trimEnd());
    lines.push("  </context_file>");
  }
  lines.push("</context_files>");
  return lines.join("\n");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

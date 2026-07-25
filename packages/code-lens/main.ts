#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { createIndexSource } from "./index-source";
import { createMcpServer } from "./server";

const DEFAULT_INDEX_PATH = "index.scip";

const indexPath = resolveIndexPath(process.argv.slice(2));
const server = createMcpServer({
  indexSource: createIndexSource(indexPath, (path) => new Uint8Array(readFileSync(path))),
  write: (chunk) => {
    process.stdout.write(chunk);
  },
});
process.stdin.on("data", (chunk) => server.receive(String(chunk)));
process.stdin.on("end", () => process.exit(0));
process.stdout.on("error", (error) => {
  process.exit(error instanceof Error && "code" in error && error.code === "EPIPE" ? 0 : 1);
});

function resolveIndexPath(argv: ReadonlyArray<string>): string {
  const flagPosition = argv.indexOf("--index");
  const flagValue = flagPosition === -1 ? undefined : argv[flagPosition + 1];
  if (flagValue !== undefined) return flagValue;
  return argv.find((entry) => !entry.startsWith("-")) ?? DEFAULT_INDEX_PATH;
}

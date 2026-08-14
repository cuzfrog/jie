import { Type } from "typebox";
import type { ExecutionContext, Tool, ToolResult } from "./types";
import { JiePlatformError } from "../jie-platform-errors";
import type { ArtifactStore } from "../storage";

const ARTIFACT_DESCRIPTION = `Shared artifact store for inter-agent work products. op="read": content at key ("Artifact not found: <key>" on miss). op="write": store content at key, overwrites; key charset [A-Za-z0-9_./-]{1,256}, content cap 5 MiB. op="list": keys and timestamps matching glob pattern (default "**", newest first), capped at limit (default 50, max 200). Not team-scoped: include the team id in keys for team-specific data.`;

const DEFAULT_PATTERN = "**";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface ArtifactDeps {
  artifactStore: ArtifactStore;
}

interface ArtifactInput {
  op: "read" | "write" | "list";
  key?: string;
  content?: string;
  pattern?: string;
  limit?: number;
}

export function createArtifactTool(dependencies: ArtifactDeps): Tool<ArtifactInput> {
  return {
    name: "artifact",
    description: ARTIFACT_DESCRIPTION,
    label: "Artifact",
    parameters: Type.Object({
      op: Type.Union([Type.Literal("read"), Type.Literal("write"), Type.Literal("list")]),
      key: Type.Optional(Type.String()),
      content: Type.Optional(Type.String()),
      pattern: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Number()),
    }),
    async execute(input: ArtifactInput, executionContext: ExecutionContext): Promise<ToolResult> {
      assertOpAllowed(input.op, executionContext);
      switch (input.op) {
        case "read":
          return readArtifact(dependencies.artifactStore, requireField(input.key, "key"));
        case "write":
          return writeArtifact(dependencies.artifactStore, requireField(input.key, "key"), requireField(input.content, "content"));
        case "list":
          return listArtifacts(dependencies.artifactStore, input.pattern ?? DEFAULT_PATTERN, input.limit);
      }
    },
  };
}

function assertOpAllowed(op: string, executionContext: ExecutionContext): void {
  const allowed = executionContext.toolArgs.get("artifact");
  if (allowed !== undefined && !allowed.includes(op)) {
    throw new JiePlatformError("TOOL_OP_DENIED", {
      detail: `op '${op}' is not allowed for role '${executionContext.agentRole}'`,
    });
  }
}

function requireField(value: string | undefined, field: string): string {
  if (value === undefined || value === "") {
    throw new JiePlatformError("INVALID_TOOL_ARGS", { detail: `'${field}' is required for this op` });
  }
  return value;
}

async function readArtifact(artifactStore: ArtifactStore, key: string): Promise<ToolResult> {
  const hit = await artifactStore.read(key);
  if (hit === null) return { content: `Artifact not found: ${key}`, details: null };
  return { content: hit.content, details: { key: hit.key, content: hit.content, created_at: hit.created_at } };
}

async function writeArtifact(artifactStore: ArtifactStore, key: string, content: string): Promise<ToolResult> {
  const written = await artifactStore.write(key, content);
  return {
    content: `Stored artifact at ${written.key} (${content.length} chars)`,
    details: { key: written.key, created_at: written.created_at },
  };
}

async function listArtifacts(artifactStore: ArtifactStore, pattern: string, limitArg: number | undefined): Promise<ToolResult> {
  const limit = limitArg === undefined ? DEFAULT_LIMIT : Math.max(1, Math.min(MAX_LIMIT, Math.floor(limitArg)));
  const glob = new Bun.Glob(pattern);
  const all = await artifactStore.list("");
  const matched = all.filter((m) => glob.match(m.key));
  const total = matched.length;
  const truncated = total > limit;
  const kept = truncated ? matched.slice(0, limit) : matched;
  const lines = kept.map((m) => `${m.key}  (${m.created_at})`);
  const footer = truncated
    ? `[showing ${kept.length} of ${total} artifacts - refine your pattern]`
    : `[${total} artifact${total === 1 ? "" : "s"}]`;
  const content = lines.length === 0 ? `No artifacts matching: ${pattern}` : `${lines.join("\n")}\n${footer}`;
  return { content, details: { kind: "artifact-list", matches: kept, total, truncated } };
}

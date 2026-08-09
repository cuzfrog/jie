import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import type { ArtifactStore } from "../storage";

const FIND_ARTIFACT_DESCRIPTION = `find_artifact(pattern?, limit?): List artifact keys whose key matches a glob
\`pattern\` (default \`**\`, all artifacts), newest first. The pattern is matched
against the full key: \`*\` matches within one segment, \`**\` crosses separators
(e.g. \`tasks/*/plan\` matches \`tasks/abc/plan\`, \`**/plan\` matches any plan at
any depth). Returns keys and creation timestamps only - never content; use
read_artifact to read a key. The artifact store is NOT team-scoped: embed the
team id in the pattern (e.g. \`{teamId}/*\`) for team-specific results. Capped at
\`limit\` (default 50, max 200); a footer reports the total and whether results
were truncated.`;

const DEFAULT_PATTERN = "**";
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface FindArtifactDeps {
  artifactStore: ArtifactStore;
}

interface FindArtifactInput {
  pattern?: string;
  limit?: number;
}

export function createFindArtifactTool(
  dependencies: FindArtifactDeps,
): Tool<FindArtifactInput> {
  return {
    name: "find_artifact",
    description: FIND_ARTIFACT_DESCRIPTION,
    label: "Find Artifacts",
    parameters: Type.Object({
      pattern: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Number()),
    }),
    async execute(input: FindArtifactInput): Promise<ToolResult> {
      const pattern = input.pattern ?? DEFAULT_PATTERN;
      const limit =
        input.limit === undefined
          ? DEFAULT_LIMIT
          : Math.max(1, Math.min(MAX_LIMIT, Math.floor(input.limit)));
      const glob = new Bun.Glob(pattern);
      const all = await dependencies.artifactStore.list("");
      const matched = all.filter((m) => glob.match(m.key));
      const total = matched.length;
      const truncated = total > limit;
      const kept = truncated ? matched.slice(0, limit) : matched;
      const lines = kept.map((m) => `${m.key}  (${m.created_at})`);
      const footer = truncated
        ? `[showing ${kept.length} of ${total} artifacts - refine your pattern]`
        : `[${total} artifact${total === 1 ? "" : "s"}]`;
      const content =
        lines.length === 0
          ? `No artifacts matching: ${pattern}`
          : `${lines.join("\n")}\n${footer}`;
      return {
        content,
        details: { kind: "artifact-list", matches: kept, total, truncated },
      };
    },
  };
}

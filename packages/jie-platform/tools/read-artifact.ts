import { Type } from "typebox";
import type { Tool, ToolResult } from "./types.ts";
import type { ArtifactStore } from "../storage";

const READ_ARTIFACT_DESCRIPTION = `read_artifact(key): Read the entry at \`key\`. Returns the content verbatim
on hit; on miss, returns \`Artifact not found: <key>\` (a normal result, not
a tool error — the LLM can reason about the miss). The artifact store is
NOT team-scoped by the platform: two teams using the same key collide. If
your work product is team-specific, include the team id (available from
ExecutionContext) in the key scheme.`;

export interface ReadArtifactDeps {
  artifacts: ArtifactStore;
}

interface ReadArtifactInput {
  key: string;
}

export function createReadArtifactTool(
  deps: ReadArtifactDeps,
): Tool<ReadArtifactInput> {
  return {
    name: "read_artifact",
    description: READ_ARTIFACT_DESCRIPTION,
    label: "Read Artifact",
    parameters: Type.Object({
      key: Type.String(),
    }),
    async execute(input: ReadArtifactInput): Promise<ToolResult> {
      const hit = await deps.artifacts.read(input.key);
      if (hit === null) {
        return {
          content: `Artifact not found: ${input.key}`,
          details: null,
        };
      }
      return {
        content: hit.content,
        details: { key: hit.key, content: hit.content, created_at: hit.created_at },
      };
    },
  };
}
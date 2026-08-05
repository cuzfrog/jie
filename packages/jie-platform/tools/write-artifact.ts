import { Type } from "typebox";
import type { ExecutionContext, Tool, ToolResult } from "./types";
import type { ArtifactStore } from "../storage";
import { JiePlatformError } from "../jie-platform-errors";

const WRITE_ARTIFACT_DESCRIPTION = `write_artifact(key, content): Store \`content\` (a string) at \`key\` in the team's
shared artifact store. Overwrites the existing entry if \`key\` is already
present. The agent builds the full key (e.g. \`{task_id}/plan\`,
\`{task_id}/research\`); the platform does not generate ids. Key charset:
\`[A-Za-z0-9_./-]{1,256}\` (\`invalid_artifact_key: <value>\` on violation).
Content cap: 5 MiB / \`content.length\` chars (\`artifact_too_large: <bytes>\`
on violation). When the team declares a lifecycle, keys matching \`*/status/*\`
are reserved for the platform's lifecycle status rows and are rejected
(\`artifact_key_reserved\`). Returns the canonical \`{ key, created_at }\` so the
artifact can be referenced in subsequent event payloads. Use the artifact
store for inter-agent work products (plans, research notes, code-change
summaries) that outlive a single tool call.`;

export interface WriteArtifactDeps {
  artifactStore: ArtifactStore;
}

interface WriteArtifactInput {
  key: string;
  content: string;
}

export function createWriteArtifactTool(
  dependencies: WriteArtifactDeps,
): Tool<WriteArtifactInput> {
  return {
    name: "write_artifact",
    description: WRITE_ARTIFACT_DESCRIPTION,
    label: "Write Artifact",
    parameters: Type.Object({
      key: Type.String(),
      content: Type.String(),
    }),
    async execute(input: WriteArtifactInput, executionContext: ExecutionContext): Promise<ToolResult> {
      if (executionContext.lifecycle !== null && isReservedStatusKey(input.key)) {
        throw new JiePlatformError("ARTIFACT_KEY_RESERVED", {
          detail: `key '${input.key}' matches the reserved '*/status/*' lifecycle status-row namespace`,
        });
      }
      const { key, created_at } = await dependencies.artifactStore.write(
        input.key,
        input.content,
      );
      return {
        content: `Stored artifact at ${key} (${input.content.length} chars)`,
        details: { key, created_at },
      };
    },
  };
}

function isReservedStatusKey(key: string): boolean {
  return key.includes("/status/");
}

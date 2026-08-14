import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { loadTeamFromDir, parseAgentManifest } from "../platform/team";

export interface ManifestValidator {
  readonly validateTeamDir: (sourceDir: string) => { readonly additionalAgentRefs: ReadonlyArray<string> };
  readonly validateAgentFile: (path: string) => void;
}

export function createManifestValidator(): ManifestValidator {
  return {
    validateTeamDir(sourceDir) {
      const blueprint = loadTeamFromDir(sourceDir);
      return { additionalAgentRefs: blueprint.additionalAgentRefs };
    },
    validateAgentFile(path) {
      const content = readFileSync(path, "utf-8");
      const id = basename(path, ".md");
      parseAgentManifest(id, content, path);
    },
  };
}

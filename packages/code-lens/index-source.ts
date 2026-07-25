import { ingestScipIndex } from "./ingest";
import { type CodeIndex } from "./model";

export interface IndexSource {
  readonly path: string;
  load(): CodeIndex;
}

export function createIndexSource(indexPath: string, readFile: (path: string) => Uint8Array): IndexSource {
  let cached: CodeIndex | null = null;
  return {
    path: indexPath,
    load(): CodeIndex {
      if (cached !== null) return cached;
      let bytes: Uint8Array;
      try {
        bytes = readFile(indexPath);
      } catch {
        throw new Error(`SCIP index not found at ${indexPath}`);
      }
      cached = ingestScipIndex(bytes);
      return cached;
    },
  };
}

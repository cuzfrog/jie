import { type CodeIndex, type IndexTool } from "./model";

export interface FileStatus {
  readonly path: string;
  readonly language: string;
  readonly symbolCount: number;
  readonly referenceCount: number;
}

export interface IndexStatus {
  readonly tool: IndexTool;
  readonly projectRoot: string;
  readonly fileCount: number;
  readonly symbolCount: number;
  readonly files: ReadonlyArray<FileStatus>;
}

export function getIndexStatus(index: CodeIndex): IndexStatus {
  const files: FileStatus[] = [];
  for (const file of index.files) {
    files.push({ path: file.path, language: file.language, symbolCount: file.symbols.length, referenceCount: file.references.length });
  }
  return { tool: index.tool, projectRoot: index.projectRoot, fileCount: index.files.length, symbolCount: index.symbols.size, files };
}

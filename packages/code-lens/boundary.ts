import { type CodeIndex, type SymbolKind } from "./model";

export interface BoundaryReference {
  readonly fromFile: string;
  readonly toFile: string | null;
  readonly symbolId: string;
  readonly symbolName: string;
  readonly targetKind: SymbolKind | "external";
  readonly targetIsLocal: boolean;
  readonly isImport: boolean;
}

export function getBoundaryReferences(index: CodeIndex): ReadonlyArray<BoundaryReference> {
  const references: BoundaryReference[] = [];
  const seen = new Set<string>();
  for (const file of index.files) {
    for (const reference of file.references) {
      if (reference.isDefinition && !reference.isImport) continue;
      const target = index.symbols.get(reference.symbolId);
      const toFile = target?.documentPath ?? null;
      if (toFile === file.path) continue;
      const key = file.path + "->" + reference.symbolId;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push({
        fromFile: file.path,
        toFile,
        symbolId: reference.symbolId,
        symbolName: target?.displayName ?? "",
        targetKind: target?.kind ?? "external",
        targetIsLocal: target?.isLocal ?? false,
        isImport: reference.isImport,
      });
    }
  }
  return references;
}

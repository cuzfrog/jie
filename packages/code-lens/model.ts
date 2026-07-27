import { type DescriptorSuffix } from "./symbol";

export type SymbolKind = DescriptorSuffix | "local" | "unknown";

export type RelationshipKind = "implementation" | "reference" | "typeDefinition" | "definition";

export interface SymbolRelationship {
  readonly targetId: string;
  readonly kind: RelationshipKind;
}

export interface CodeSymbol {
  readonly id: string;
  readonly displayName: string;
  readonly kind: SymbolKind;
  readonly signature: string | null;
  readonly isLocal: boolean;
  readonly enclosingId: string;
  readonly documentPath: string | null;
  readonly relationships: ReadonlyArray<SymbolRelationship>;
}

export interface SymbolRange {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export interface SymbolReference {
  readonly symbolId: string;
  readonly isDefinition: boolean;
  readonly isImport: boolean;
  readonly range: SymbolRange;
}

export interface CodeFile {
  readonly path: string;
  readonly language: string;
  readonly symbols: ReadonlyArray<CodeSymbol>;
  readonly references: ReadonlyArray<SymbolReference>;
}

export interface IndexTool {
  readonly name: string;
  readonly version: string;
}

export interface CodeIndex {
  readonly tool: IndexTool;
  readonly projectRoot: string;
  readonly files: ReadonlyArray<CodeFile>;
  readonly symbols: ReadonlyMap<string, CodeSymbol>;
}

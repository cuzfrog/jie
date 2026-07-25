import { type CodeFile, type CodeIndex, type CodeSymbol, type SymbolKind } from "./model";

export interface StructureSymbol {
  readonly id: string;
  readonly name: string;
  readonly kind: SymbolKind;
  readonly signature: string | null;
  readonly children: ReadonlyArray<StructureSymbol>;
}

export interface FileStructure {
  readonly path: string;
  readonly language: string;
  readonly symbols: ReadonlyArray<StructureSymbol>;
}

export function getStructure(index: CodeIndex, pathPrefix?: string): ReadonlyArray<FileStructure> {
  const structures: FileStructure[] = [];
  for (const file of index.files) {
    if (pathPrefix !== undefined && !file.path.startsWith(pathPrefix)) continue;
    structures.push(buildFileStructure(file));
  }
  return structures;
}

const STRUCTURAL_KINDS: ReadonlySet<SymbolKind> = new Set(["namespace", "type", "term", "method", "macro"]);

function buildFileStructure(file: CodeFile): FileStructure {
  const structural = file.symbols.filter((symbol) => STRUCTURAL_KINDS.has(symbol.kind));
  const byId = new Map(structural.map((symbol) => [symbol.id, symbol] as const));
  const childrenOf = new Map<string, CodeSymbol[]>();
  const roots: CodeSymbol[] = [];
  for (const symbol of structural) {
    const parent = byId.get(symbol.enclosingId);
    if (parent === undefined) roots.push(symbol);
    else addChild(childrenOf, parent.id, symbol);
  }
  const topLevel = roots.length === 1 && roots[0].kind === "namespace" ? childrenOf.get(roots[0].id) ?? [] : roots;
  return { path: file.path, language: file.language, symbols: topLevel.map((symbol) => toNode(symbol, childrenOf)) };
}

function toNode(symbol: CodeSymbol, childrenOf: ReadonlyMap<string, ReadonlyArray<CodeSymbol>>): StructureSymbol {
  const children = (childrenOf.get(symbol.id) ?? []).map((child) => toNode(child, childrenOf));
  return { id: symbol.id, name: symbol.displayName, kind: symbol.kind, signature: symbol.signature, children };
}

function addChild(childrenOf: Map<string, CodeSymbol[]>, parentId: string, symbol: CodeSymbol): void {
  const children = childrenOf.get(parentId);
  if (children === undefined) childrenOf.set(parentId, [symbol]);
  else children.push(symbol);
}

import { scip } from "./scip/scip.js";
import { parseSymbol } from "./symbol";
import { type CodeFile, type CodeIndex, type CodeSymbol, type IndexTool, type RelationshipKind, type SymbolRange, type SymbolReference, type SymbolRelationship } from "./model";

const DEFINITION_ROLE = 1;
const IMPORT_ROLE = 2;

export function ingestScipIndex(bytes: Uint8Array): CodeIndex {
  const index = scip.Index.decode(bytes);
  const metadata = index.metadata;
  const tool: IndexTool = { name: metadata?.toolInfo?.name ?? "", version: metadata?.toolInfo?.version ?? "" };
  const symbols = new Map<string, CodeSymbol>();
  const files: CodeFile[] = [];
  for (const document of index.documents) files.push(ingestDocument(document, symbols));
  for (const external of index.externalSymbols) addSymbol(external, null, symbols);
  return { tool, projectRoot: metadata?.projectRoot ?? "", files, symbols };
}

function ingestDocument(document: scip.Document.$Properties, symbols: Map<string, CodeSymbol>): CodeFile {
  const path = document.relativePath ?? "";
  const defined: CodeSymbol[] = [];
  for (const info of document.symbols ?? []) defined.push(addSymbol(info, path, symbols));
  const references: SymbolReference[] = [];
  for (const occurrence of document.occurrences ?? []) references.push(ingestOccurrence(occurrence));
  return { path, language: languageFromPath(path), symbols: defined, references };
}

function addSymbol(info: scip.SymbolInformation.$Properties, documentPath: string | null, symbols: Map<string, CodeSymbol>): CodeSymbol {
  const id = info.symbol ?? "";
  const parsed = parseSymbol(id);
  const symbol: CodeSymbol = {
    id,
    displayName: parsed.displayName,
    kind: parsed.isLocal ? "local" : parsed.suffix ?? "unknown",
    signature: signatureOf(info),
    isLocal: parsed.isLocal,
    enclosingId: parsed.enclosing,
    documentPath,
    relationships: ingestRelationships(info.relationships ?? []),
  };
  if (!symbols.has(id)) symbols.set(id, symbol);
  return symbol;
}

function signatureOf(info: scip.SymbolInformation.$Properties): string | null {
  const signatureDocumentation = info.signatureDocumentation;
  if (signatureDocumentation?.text) return signatureDocumentation.text;
  return signatureFromDocumentation(info.documentation ?? []);
}

function signatureFromDocumentation(documentation: ReadonlyArray<string>): string | null {
  for (const entry of documentation) {
    const stripped = stripCodeFence(entry);
    if (stripped !== null) return stripped;
  }
  return null;
}

function stripCodeFence(markdown: string): string | null {
  const lines = markdown.split("\n");
  if (lines.length < 2 || !lines[0].startsWith("```")) return null;
  const body = lines.slice(1);
  if (body[body.length - 1]?.trim() === "```") body.pop();
  const text = body.join("\n").trim();
  return text === "" ? null : text;
}

function ingestRelationships(relationships: ReadonlyArray<scip.Relationship.$Properties>): ReadonlyArray<SymbolRelationship> {
  return relationships.map((relationship) => ({ targetId: relationship.symbol ?? "", kind: relationshipKind(relationship) }));
}

function relationshipKind(relationship: scip.Relationship.$Properties): RelationshipKind {
  if (relationship.isImplementation === true) return "implementation";
  if (relationship.isTypeDefinition === true) return "typeDefinition";
  if (relationship.isDefinition === true) return "definition";
  return "reference";
}

function ingestOccurrence(occurrence: scip.Occurrence.$Properties): SymbolReference {
  const roles = occurrence.symbolRoles ?? 0;
  return {
    symbolId: occurrence.symbol ?? "",
    isDefinition: (roles & DEFINITION_ROLE) !== 0,
    isImport: (roles & IMPORT_ROLE) !== 0,
    range: rangeOf(occurrence.range ?? []),
  };
}

function rangeOf(range: ReadonlyArray<number>): SymbolRange {
  if (range.length >= 4) return { startLine: range[0], startColumn: range[1], endLine: range[2], endColumn: range[3] };
  if (range.length === 3) return { startLine: range[0], startColumn: range[1], endLine: range[0], endColumn: range[2] };
  return { startLine: 0, startColumn: 0, endLine: 0, endColumn: 0 };
}

const LANGUAGE_BY_EXTENSION = { ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript", ".py": "python", ".java": "java", ".rs": "rust", ".go": "go" } as const;

function languageFromPath(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "unknown";
  return LANGUAGE_BY_EXTENSION[path.slice(dot) as keyof typeof LANGUAGE_BY_EXTENSION] ?? "unknown";
}

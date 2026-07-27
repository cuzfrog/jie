import { getBoundaryReferences, type BoundaryReference } from "./boundary";
import { findCycles, type DirectedGraph } from "./graph";
import { getImportGraph } from "./import-graph";
import { type CodeIndex } from "./model";
import { type JsonObject, type JsonValue, type ToolDefinition } from "./protocol";
import { getIndexStatus } from "./status";
import { getStructure, type FileStructure, type StructureSymbol } from "./structure";
import { getTypeGraph } from "./type-graph";

export interface ToolOutcome {
  readonly isError: boolean;
  readonly text: string;
}

export const TOOL_DEFINITIONS: ReadonlyArray<ToolDefinition> = [
  {
    name: "index_status",
    description: "Summarize the loaded code index: indexer tool, project root, and per-file symbol and reference counts.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "code_structure",
    description: "Layered code structure with implementation bodies stripped: files, top-level declarations, type members, and their signatures. Optionally filter files by path prefix.",
    inputSchema: {
      type: "object",
      properties: { pathPrefix: { type: "string", description: "Only include files whose path starts with this prefix." } },
    },
  },
  {
    name: "import_graph",
    description: "File-level dependency graph: an edge A -> B means file A references symbols defined in file B.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "type_graph",
    description: "Type-level dependency graph: edges are implements and type-definition relationships between types.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "cycles",
    description: "Detect cyclic dependencies in the file import graph (scope files) or the type graph (scope types).",
    inputSchema: {
      type: "object",
      properties: { scope: { type: "string", enum: ["files", "types"], description: "Which graph to check. Defaults to files." } },
    },
  },
  {
    name: "boundary_references",
    description: "Cross-file references with visibility facts: target kind, where the target is defined, whether the target is local to its file, and whether the reference is an import.",
    inputSchema: {
      type: "object",
      properties: { file: { type: "string", description: "Only include references originating from this exact file path." } },
    },
  },
];

export function executeTool(index: CodeIndex, name: string, toolArguments: JsonObject): ToolOutcome {
  switch (name) {
    case "index_status": return outcome(renderStatus(index));
    case "code_structure": return outcome(renderStructure(getStructure(index, stringArgument(toolArguments, "pathPrefix"))));
    case "import_graph": return outcome(renderImportGraph(getImportGraph(index)));
    case "type_graph": return outcome(renderTypeGraph(index, getTypeGraph(index)));
    case "cycles": return cyclesOutcome(index, stringArgument(toolArguments, "scope"));
    case "boundary_references":
      return outcome(renderBoundaryReferences(getBoundaryReferences(index), stringArgument(toolArguments, "file")));
    default: return { isError: true, text: `Unknown tool: ${name}` };
  }
}

function outcome(text: string): ToolOutcome {
  return { isError: false, text };
}

function stringArgument(values: JsonObject, key: string): string | undefined {
  const value: JsonValue | undefined = values[key];
  return typeof value === "string" ? value : undefined;
}

function cyclesOutcome(index: CodeIndex, scopeArgument: string | undefined): ToolOutcome {
  const scope = scopeArgument ?? "files";
  if (scope !== "files" && scope !== "types") return { isError: true, text: `Invalid scope "${scope}"; expected "files" or "types".` };
  const graph = scope === "files" ? getImportGraph(index) : getTypeGraph(index);
  const nameOf = scope === "files" ? (id: string): string => id : displayNameLookup(index);
  return outcome(renderCycles(findCycles(graph), nameOf));
}

function renderStatus(index: CodeIndex): string {
  const status = getIndexStatus(index);
  const lines = [
    `indexer: ${status.tool.name} ${status.tool.version}`,
    `project root: ${status.projectRoot}`,
    `${status.fileCount} files, ${status.symbolCount} symbols`,
  ];
  for (const file of [...status.files].sort((a, b) => a.path.localeCompare(b.path))) {
    lines.push(`  ${file.path} (${file.language}): ${file.symbolCount} symbols, ${file.referenceCount} references`);
  }
  return lines.join("\n");
}

function renderStructure(structures: ReadonlyArray<FileStructure>): string {
  if (structures.length === 0) return "No files match the path prefix.";
  const lines: string[] = [];
  for (const file of [...structures].sort((a, b) => a.path.localeCompare(b.path))) {
    lines.push(`${file.path} (${file.language})`);
    for (const symbol of file.symbols) appendStructureNode(symbol, 1, lines);
  }
  return lines.join("\n");
}

function renderImportGraph(graph: DirectedGraph): string {
  if (graph.edges.length === 0) return "No cross-file imports.";
  const sorted = [...graph.edges].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return sorted.map((edge) => `${edge.from} -> ${edge.to}`).join("\n");
}

function renderTypeGraph(index: CodeIndex, graph: DirectedGraph): string {
  const nameOf = displayNameLookup(index);
  const lines = [`types: ${graph.nodes.length}, relationships: ${graph.edges.length}`];
  if (graph.edges.length === 0) lines.push("No type relationships.");
  const sorted = [...graph.edges].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  for (const edge of sorted) lines.push(`${nameOf(edge.from)} -> ${nameOf(edge.to)} [${relationshipLabel(index, edge.from, edge.to)}]`);
  return lines.join("\n");
}

function renderCycles(cycles: ReadonlyArray<ReadonlyArray<string>>, nameOf: (id: string) => string): string {
  if (cycles.length === 0) return "No cycles detected.";
  const lines = [`${cycles.length} ${cycles.length === 1 ? "cycle" : "cycles"} detected:`];
  cycles.forEach((cycle, position) => {
    const first = cycle[0];
    lines.push(`  ${position + 1}. ${[...cycle, first].map(nameOf).join(" -> ")}`);
  });
  return lines.join("\n");
}

function renderBoundaryReferences(references: ReadonlyArray<BoundaryReference>, fileFilter: string | undefined): string {
  const matching = references.filter((reference) => fileFilter === undefined || reference.fromFile === fileFilter);
  if (matching.length === 0) return "No cross-file references.";
  const sorted = [...matching].sort((a, b) => a.fromFile.localeCompare(b.fromFile) || a.symbolName.localeCompare(b.symbolName));
  return sorted.map(describeBoundaryReference).join("\n");
}

function appendStructureNode(node: StructureSymbol, depth: number, lines: string[]): void {
  const indent = "  ".repeat(depth);
  for (const line of (node.signature ?? node.name).split("\n")) lines.push(indent + line);
  for (const child of node.children) appendStructureNode(child, depth + 1, lines);
}

function displayNameLookup(index: CodeIndex): (id: string) => string {
  const names = new Map([...index.symbols].map(([id, symbol]) => [id, symbol.displayName] as const));
  return (id: string): string => names.get(id) ?? id;
}

function relationshipLabel(index: CodeIndex, fromId: string, toId: string): string {
  const kind = index.symbols.get(fromId)?.relationships.find((relationship) => relationship.targetId === toId)?.kind;
  if (kind === "implementation") return "implements";
  if (kind === "typeDefinition") return "type definition";
  return kind ?? "related";
}

function describeBoundaryReference(reference: BoundaryReference): string {
  const facts = [reference.targetKind, reference.toFile === null ? "defined outside the index" : `defined in ${reference.toFile}`];
  if (reference.isImport) facts.push("import");
  if (reference.targetIsLocal) facts.push("local to the target file");
  return `${reference.fromFile} -> ${reference.symbolName} [${facts.join(", ")}]`;
}

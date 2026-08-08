import { type DirectedEdge, type DirectedGraph } from "./graph";
import { type CodeIndex, type RelationshipKind } from "./model";

const TYPE_RELATIONSHIPS: ReadonlySet<RelationshipKind> = new Set(["implementation", "typeDefinition"]);

export function getTypeGraph(index: CodeIndex): DirectedGraph {
  const typeIds = new Set<string>();
  for (const symbol of index.symbols.values()) if (symbol.kind === "type") typeIds.add(symbol.id);
  const seen = new Set<string>();
  const edges: DirectedEdge[] = [];
  for (const symbol of index.symbols.values()) {
    if (symbol.kind !== "type") continue;
    for (const relationship of symbol.relationships) {
      if (!TYPE_RELATIONSHIPS.has(relationship.kind) || !typeIds.has(relationship.targetId)) continue;
      const key = symbol.id + "->" + relationship.targetId;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: symbol.id, to: relationship.targetId });
    }
  }
  return { nodes: [...typeIds], edges };
}

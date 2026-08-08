import { type DirectedEdge, type DirectedGraph } from "./graph";
import { type CodeIndex } from "./model";

export function getImportGraph(index: CodeIndex): DirectedGraph {
  const nodes = index.files.map((file) => file.path);
  const seen = new Set<string>();
  const edges: DirectedEdge[] = [];
  for (const file of index.files) {
    for (const reference of file.references) {
      const toPath = index.symbols.get(reference.symbolId)?.documentPath;
      if (toPath === undefined || toPath === null || toPath === file.path) continue;
      const key = file.path + "->" + toPath;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: file.path, to: toPath });
    }
  }
  return { nodes, edges };
}

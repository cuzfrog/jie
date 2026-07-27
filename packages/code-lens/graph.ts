export interface DirectedEdge {
  readonly from: string;
  readonly to: string;
}

export interface DirectedGraph {
  readonly nodes: ReadonlyArray<string>;
  readonly edges: ReadonlyArray<DirectedEdge>;
}

export function findCycles(graph: DirectedGraph): ReadonlyArray<ReadonlyArray<string>> {
  const adjacency = buildAdjacency(graph);
  const cycles: ReadonlyArray<string>[] = [];
  for (const component of stronglyConnectedComponents(graph.nodes, adjacency)) {
    if (component.length > 1 || hasSelfEdge(graph.edges, component[0])) cycles.push(component);
  }
  return cycles;
}

function buildAdjacency(graph: DirectedGraph): ReadonlyMap<string, ReadonlyArray<string>> {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node, []);
  for (const edge of graph.edges) adjacency.get(edge.from)?.push(edge.to);
  return adjacency;
}

function stronglyConnectedComponents(nodes: ReadonlyArray<string>, adjacency: ReadonlyMap<string, ReadonlyArray<string>>): ReadonlyArray<ReadonlyArray<string>> {
  const indexOf = new Map(nodes.map((node, position) => [node, position] as const));
  const index = new Array<number>(nodes.length).fill(-1);
  const lowLink = new Array<number>(nodes.length).fill(0);
  const onStack = new Array<boolean>(nodes.length).fill(false);
  const stack: number[] = [];
  const components: string[][] = [];
  let counter = 0;
  function visit(position: number): void {
    index[position] = counter;
    lowLink[position] = counter;
    counter += 1;
    stack.push(position);
    onStack[position] = true;
    for (const neighborName of adjacency.get(nodes[position]) ?? []) {
      const neighbor = indexOf.get(neighborName);
      if (neighbor === undefined) continue;
      if (index[neighbor] === -1) {
        visit(neighbor);
        lowLink[position] = Math.min(lowLink[position], lowLink[neighbor]);
      } else if (onStack[neighbor]) {
        lowLink[position] = Math.min(lowLink[position], index[neighbor]);
      }
    }
    if (lowLink[position] === index[position]) {
      const component: string[] = [];
      while (true) {
        const member = stack.pop();
        if (member === undefined) break;
        onStack[member] = false;
        component.push(nodes[member]);
        if (member === position) break;
      }
      components.push(component);
    }
  }
  for (let position = 0; position < nodes.length; position++) if (index[position] === -1) visit(position);
  return components;
}

function hasSelfEdge(edges: ReadonlyArray<DirectedEdge>, node: string): boolean {
  return edges.some((edge) => edge.from === node && edge.to === node);
}

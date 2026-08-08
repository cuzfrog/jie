import { findCycles, type DirectedGraph } from "./graph";

function graph(nodes: ReadonlyArray<string>, edges: ReadonlyArray<[string, string]>): DirectedGraph {
  return { nodes, edges: edges.map(([from, to]) => ({ from, to })) };
}

describe("findCycles", () => {
  test("returns no cycles for an acyclic graph", () => {
    expect(findCycles(graph(["a", "b", "c"], [["a", "b"], ["b", "c"]]))).toEqual([]);
  });

  test("detects a two-node cycle", () => {
    const cycles = findCycles(graph(["a", "b"], [["a", "b"], ["b", "a"]]));
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]].sort()).toEqual(["a", "b"]);
  });

  test("detects a three-node cycle", () => {
    const cycles = findCycles(graph(["a", "b", "c"], [["a", "b"], ["b", "c"], ["c", "a"]]));
    expect(cycles).toHaveLength(1);
    expect([...cycles[0]].sort()).toEqual(["a", "b", "c"]);
  });

  test("detects a self-loop as a cycle", () => {
    const cycles = findCycles(graph(["a"], [["a", "a"]]));
    expect(cycles).toEqual([["a"]]);
  });

  test("detects multiple disjoint cycles independently", () => {
    const cycles = findCycles(graph(["a", "b", "c", "d"], [["a", "b"], ["b", "a"], ["c", "d"], ["d", "c"]]));
    expect(cycles).toHaveLength(2);
  });

  test("does not report a node with outgoing edges but no cycle", () => {
    expect(findCycles(graph(["a", "b"], [["a", "b"]]))).toEqual([]);
  });
});

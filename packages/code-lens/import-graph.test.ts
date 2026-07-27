import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getImportGraph } from "./import-graph";
import { ingestScipIndex } from "./ingest";

const index = ingestScipIndex(new Uint8Array(readFileSync(join(import.meta.dir, "fixtures/ts-project/index.scip"))));

describe("getImportGraph", () => {
  test("lists every indexed file as a node", () => {
    expect([...getImportGraph(index).nodes].sort()).toEqual(["src/animal.ts", "src/index.ts"]);
  });

  test("adds an edge from the importing file to the defining file", () => {
    expect(getImportGraph(index).edges).toContainEqual({ from: "src/index.ts", to: "src/animal.ts" });
  });

  test("omits self-edges and edges that do not exist", () => {
    const edges = getImportGraph(index).edges;
    expect(edges).not.toContainEqual({ from: "src/animal.ts", to: "src/animal.ts" });
    expect(edges).not.toContainEqual({ from: "src/animal.ts", to: "src/index.ts" });
  });

  test("deduplicates parallel references into a single edge", () => {
    const matching = getImportGraph(index).edges.filter((edge) => edge.from === "src/index.ts" && edge.to === "src/animal.ts");
    expect(matching).toHaveLength(1);
  });
});

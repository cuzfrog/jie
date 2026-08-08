import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestScipIndex } from "./ingest";
import { getTypeGraph } from "./type-graph";

const HEADER = "scip-typescript npm fixture 0.0.0 ";
const ANIMAL = HEADER + "src/`animal.ts`/Animal#";
const DOG = HEADER + "src/`animal.ts`/Dog#";
const index = ingestScipIndex(new Uint8Array(readFileSync(join(import.meta.dir, "fixtures/ts-project/index.scip"))));

describe("getTypeGraph", () => {
  test("nodes are type symbols", () => {
    const nodes = getTypeGraph(index).nodes;
    expect(nodes).toContain(ANIMAL);
    expect(nodes).toContain(DOG);
  });

  test("an implements clause becomes an implementation edge", () => {
    expect(getTypeGraph(index).edges).toContainEqual({ from: DOG, to: ANIMAL });
  });

  test("non-type symbols are not nodes", () => {
    expect(getTypeGraph(index).nodes).not.toContain(HEADER + "src/`animal.ts`/answer.");
  });
});

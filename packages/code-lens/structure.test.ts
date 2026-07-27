import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestScipIndex } from "./ingest";
import { getStructure, type StructureSymbol } from "./structure";

const index = ingestScipIndex(new Uint8Array(readFileSync(join(import.meta.dir, "fixtures/ts-project/index.scip"))));

function collectKinds(symbols: ReadonlyArray<StructureSymbol>): string[] {
  const kinds: string[] = [];
  for (const symbol of symbols) {
    kinds.push(symbol.kind);
    kinds.push(...collectKinds(symbol.children));
  }
  return kinds;
}

describe("getStructure", () => {
  test("returns one file structure per indexed file", () => {
    expect(getStructure(index).map((structure) => structure.path).sort()).toEqual(["src/animal.ts", "src/index.ts"]);
  });

  test("unwraps the file module symbol to top-level declarations", () => {
    const animal = getStructure(index, "src/animal.ts")[0];
    expect(animal.symbols.map((symbol) => symbol.name).sort()).toEqual(["Animal", "Dog", "answer", "describe", "privateHelper"]);
  });

  test("exposes type members as nested children with signatures", () => {
    const animal = getStructure(index, "src/animal.ts")[0];
    const dog = animal.symbols.find((symbol) => symbol.name === "Dog");
    expect(dog?.kind).toBe("type");
    expect(dog?.signature).toBe("class Dog");
    expect(dog?.children.map((child) => child.name)).toContain("sound");
  });

  test("excludes parameters and locals from the tree", () => {
    const animal = getStructure(index, "src/animal.ts")[0];
    const kinds = collectKinds(animal.symbols);
    expect(kinds).not.toContain("parameter");
    expect(kinds).not.toContain("local");
  });

  test("filters by path prefix", () => {
    expect(getStructure(index, "src/index").map((structure) => structure.path)).toEqual(["src/index.ts"]);
  });
});

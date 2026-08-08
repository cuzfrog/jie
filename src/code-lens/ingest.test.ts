import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestScipIndex } from "./ingest";

const HEADER = "scip-typescript npm fixture 0.0.0 ";
const bytes = new Uint8Array(readFileSync(join(import.meta.dir, "fixtures/ts-project/index.scip")));
const index = ingestScipIndex(bytes);

describe("ingestScipIndex", () => {
  test("captures the indexer tool metadata", () => {
    expect(index.tool).toEqual({ name: "scip-typescript", version: "0.4.0" });
  });

  test("ingests one file per document with a derived language", () => {
    expect(index.files.map((file) => file.path).sort()).toEqual(["src/animal.ts", "src/index.ts"]);
    for (const file of index.files) expect(file.language).toBe("typescript");
  });

  test("indexes every defined symbol by id", () => {
    const dog = index.symbols.get(HEADER + "src/`animal.ts`/Dog#");
    expect(dog?.kind).toBe("type");
    expect(dog?.displayName).toBe("Dog");
    expect(dog?.isLocal).toBe(false);
    expect(dog?.documentPath).toBe("src/animal.ts");
  });

  test("extracts a body-stripped signature from documentation", () => {
    expect(index.symbols.get(HEADER + "src/`animal.ts`/Dog#")?.signature).toBe("class Dog");
    expect(index.symbols.get(HEADER + "src/`animal.ts`/Animal#")?.signature).toBe("interface Animal");
  });

  test("records an implements clause as an implementation edge", () => {
    const dog = index.symbols.get(HEADER + "src/`animal.ts`/Dog#");
    expect(dog?.relationships).toContainEqual({ targetId: HEADER + "src/`animal.ts`/Animal#", kind: "implementation" });
  });

  test("links a member to its enclosing type", () => {
    const sound = index.symbols.get(HEADER + "src/`animal.ts`/Dog#sound().");
    expect(sound?.kind).toBe("method");
    expect(sound?.enclosingId).toBe(HEADER + "src/`animal.ts`/Dog#");
  });

  test("treats a function-body local as a local symbol", () => {
    const local = index.symbols.get("local 2");
    expect(local?.isLocal).toBe(true);
    expect(local?.kind).toBe("local");
  });

  test("treats a module-private function as a non-local symbol", () => {
    const helper = index.symbols.get(HEADER + "src/`animal.ts`/privateHelper().");
    expect(helper?.isLocal).toBe(false);
    expect(helper?.kind).toBe("method");
  });

  test("records a cross-file reference from an occurrence", () => {
    const indexFile = index.files.find((file) => file.path === "src/index.ts");
    const dogReference = indexFile?.references.find((reference) => reference.symbolId === HEADER + "src/`animal.ts`/Dog#");
    expect(dogReference?.isDefinition).toBe(false);
  });

  test("marks definitions among references", () => {
    const animalFile = index.files.find((file) => file.path === "src/animal.ts");
    const dogDefinition = animalFile?.references.find((reference) => reference.symbolId === HEADER + "src/`animal.ts`/Dog#");
    expect(dogDefinition?.isDefinition).toBe(true);
  });
});

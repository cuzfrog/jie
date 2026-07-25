import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getBoundaryReferences } from "./boundary";
import { ingestScipIndex } from "./ingest";

const index = ingestScipIndex(new Uint8Array(readFileSync(join(import.meta.dir, "fixtures/ts-project/index.scip"))));

describe("getBoundaryReferences", () => {
  test("reports a cross-file reference to a type", () => {
    const dogReference = getBoundaryReferences(index).find((reference) => reference.fromFile === "src/index.ts" && reference.symbolName === "Dog");
    expect(dogReference?.toFile).toBe("src/animal.ts");
    expect(dogReference?.targetKind).toBe("type");
    expect(dogReference?.targetIsLocal).toBe(false);
    expect(dogReference?.isImport).toBe(false);
  });

  test("never reports a reference whose target lives in the same file", () => {
    for (const reference of getBoundaryReferences(index)) expect(reference.toFile).not.toBe(reference.fromFile);
  });

  test("does not report a definition as a boundary reference", () => {
    const definition = getBoundaryReferences(index).find((reference) => reference.fromFile === "src/animal.ts" && reference.symbolName === "Dog");
    expect(definition).toBeUndefined();
  });
});

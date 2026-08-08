import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestScipIndex } from "./ingest";
import { getIndexStatus } from "./status";

const index = ingestScipIndex(new Uint8Array(readFileSync(join(import.meta.dir, "fixtures/ts-project/index.scip"))));

describe("getIndexStatus", () => {
  test("reports the indexer tool and aggregate counts", () => {
    const status = getIndexStatus(index);
    expect(status.tool).toEqual({ name: "scip-typescript", version: "0.4.0" });
    expect(status.fileCount).toBe(2);
    expect(status.symbolCount).toBeGreaterThan(0);
  });

  test("reports per-file language and counts", () => {
    const animal = getIndexStatus(index).files.find((file) => file.path === "src/animal.ts");
    expect(animal?.language).toBe("typescript");
    expect(animal?.symbolCount).toBeGreaterThan(0);
    expect(animal?.referenceCount).toBeGreaterThan(0);
  });
});

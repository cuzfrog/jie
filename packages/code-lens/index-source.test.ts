import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createIndexSource } from "./index-source";

const FIXTURE_INDEX = join(import.meta.dir, "fixtures/ts-project/index.scip");
const FIXTURE_BYTES = new Uint8Array(readFileSync(FIXTURE_INDEX));

describe("createIndexSource", () => {
  test("loads and ingests the index at the given path", () => {
    const readFile = vi.fn<(path: string) => Uint8Array>();
    readFile.mockReturnValue(FIXTURE_BYTES);
    const index = createIndexSource(FIXTURE_INDEX, readFile).load();
    expect(index.tool.name).toBe("scip-typescript");
    expect(index.files.length).toBe(2);
    expect(readFile).toHaveBeenCalledWith(FIXTURE_INDEX);
  });

  test("memoizes the ingested index across loads", () => {
    const readFile = vi.fn<(path: string) => Uint8Array>();
    readFile.mockReturnValue(FIXTURE_BYTES);
    const source = createIndexSource(FIXTURE_INDEX, readFile);
    source.load();
    source.load();
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  test("exposes the index path", () => {
    const readFile = vi.fn<(path: string) => Uint8Array>();
    readFile.mockReturnValue(FIXTURE_BYTES);
    expect(createIndexSource(FIXTURE_INDEX, readFile).path).toBe(FIXTURE_INDEX);
  });

  test("throws a clear error when the index cannot be read", () => {
    const readFile = vi.fn<(path: string) => Uint8Array>();
    readFile.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const source = createIndexSource("missing/index.scip", readFile);
    expect(() => source.load()).toThrow("SCIP index not found at missing/index.scip");
  });
});

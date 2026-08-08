import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ingestScipIndex } from "./ingest";
import { TOOL_DEFINITIONS, executeTool } from "./tools";

const index = ingestScipIndex(new Uint8Array(readFileSync(join(import.meta.dir, "fixtures/ts-project/index.scip"))));

describe("TOOL_DEFINITIONS", () => {
  test("exposes the six query tools", () => {
    const names = TOOL_DEFINITIONS.map((definition) => definition.name).sort();
    expect(names).toEqual(["boundary_references", "code_structure", "cycles", "import_graph", "index_status", "type_graph"]);
  });

  test("every tool has a description and an object input schema", () => {
    for (const definition of TOOL_DEFINITIONS) {
      expect(definition.description.length).toBeGreaterThan(0);
      expect(definition.inputSchema.type).toBe("object");
    }
  });
});

describe("executeTool", () => {
  test("index_status reports the indexer and per-file counts", () => {
    const text = executeTool(index, "index_status", {}).text;
    expect(text).toContain("scip-typescript");
    expect(text).toContain("2 files");
    expect(text).toContain("src/animal.ts (typescript)");
  });

  test("code_structure shows declarations and members without bodies", () => {
    const text = executeTool(index, "code_structure", {}).text;
    expect(text).toContain("src/animal.ts (typescript)");
    expect(text).toContain("interface Animal");
    expect(text).toContain("class Dog");
    expect(text).toContain("sound");
    expect(text).not.toContain("woof");
  });

  test("code_structure filters by path prefix", () => {
    const text = executeTool(index, "code_structure", { pathPrefix: "src/index" }).text;
    expect(text).toContain("src/index.ts");
    expect(text).not.toContain("src/animal.ts");
  });

  test("import_graph shows the edge from the importing file to the defining file", () => {
    expect(executeTool(index, "import_graph", {}).text).toContain("src/index.ts -> src/animal.ts");
  });

  test("type_graph shows the implements relationship between display names", () => {
    const text = executeTool(index, "type_graph", {}).text;
    expect(text).toContain("Dog -> Animal [implements]");
  });

  test("cycles reports no cycles in the acyclic fixture", () => {
    expect(executeTool(index, "cycles", {}).text).toBe("No cycles detected.");
    expect(executeTool(index, "cycles", { scope: "types" }).text).toBe("No cycles detected.");
  });

  test("cycles rejects an unknown scope", () => {
    const result = executeTool(index, "cycles", { scope: "modules" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("modules");
  });

  test("boundary_references shows cross-file references with visibility facts", () => {
    const line = executeTool(index, "boundary_references", {}).text.split("\n").find((entry) => entry.includes("-> Dog"));
    expect(line).toContain("src/index.ts -> Dog");
    expect(line).toContain("type");
    expect(line).toContain("defined in src/animal.ts");
  });

  test("boundary_references filters by originating file", () => {
    const text = executeTool(index, "boundary_references", { file: "src/animal.ts" }).text;
    expect(text).not.toContain("src/index.ts ->");
  });

  test("unknown tool names produce an error outcome", () => {
    const result = executeTool(index, "nope", {});
    expect(result.isError).toBe(true);
    expect(result.text).toBe("Unknown tool: nope");
  });
});

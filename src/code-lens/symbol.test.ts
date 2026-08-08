import { parseSymbol } from "./symbol";

const HEADER = "scip-typescript npm fixture 0.0.0 ";

describe("parseSymbol", () => {
  test("parses the header into scheme and package fields", () => {
    const parsed = parseSymbol(HEADER + "src/`animal.ts`/Animal#");
    expect(parsed.isLocal).toBe(false);
    expect(parsed.scheme).toBe("scip-typescript");
    expect(parsed.manager).toBe("npm");
    expect(parsed.packageName).toBe("fixture");
    expect(parsed.version).toBe("0.0.0");
  });

  test("parses a type descriptor with an escaped namespace name", () => {
    const parsed = parseSymbol(HEADER + "src/`animal.ts`/Animal#");
    expect(parsed.descriptors).toEqual([
      { name: "src", suffix: "namespace", disambiguator: "" },
      { name: "animal.ts", suffix: "namespace", disambiguator: "" },
      { name: "Animal", suffix: "type", disambiguator: "" },
    ]);
    expect(parsed.displayName).toBe("Animal");
    expect(parsed.suffix).toBe("type");
    expect(parsed.enclosing).toBe(HEADER + "src/`animal.ts`/");
  });

  test("parses a method descriptor and its enclosing type", () => {
    const parsed = parseSymbol(HEADER + "src/`animal.ts`/Animal#sound().");
    expect(parsed.displayName).toBe("sound");
    expect(parsed.suffix).toBe("method");
    expect(parsed.descriptors[3]).toEqual({ name: "sound", suffix: "method", disambiguator: "" });
    expect(parsed.enclosing).toBe(HEADER + "src/`animal.ts`/Animal#");
  });

  test("parses a term descriptor as a field", () => {
    const parsed = parseSymbol(HEADER + "src/`animal.ts`/Animal#name.");
    expect(parsed.displayName).toBe("name");
    expect(parsed.suffix).toBe("term");
  });

  test("parses a parameter descriptor", () => {
    const parsed = parseSymbol(HEADER + "src/`index.ts`/greet().(a)");
    expect(parsed.displayName).toBe("a");
    expect(parsed.suffix).toBe("parameter");
    expect(parsed.enclosing).toBe(HEADER + "src/`index.ts`/greet().");
  });

  test("parses a constructor method with an escaped name", () => {
    const parsed = parseSymbol(HEADER + "src/`animal.ts`/Dog#`<constructor>`().");
    expect(parsed.displayName).toBe("<constructor>");
    expect(parsed.suffix).toBe("method");
  });

  test("parses a method disambiguator", () => {
    const parsed = parseSymbol(HEADER + "Foo#bar(baz).");
    expect(parsed.displayName).toBe("bar");
    expect(parsed.suffix).toBe("method");
    expect(parsed.descriptors[1]).toEqual({ name: "bar", suffix: "method", disambiguator: "baz" });
  });

  test("parses a meta descriptor", () => {
    const parsed = parseSymbol(HEADER + "src/`index.ts`/greet().(a)typeLiteral0:");
    expect(parsed.displayName).toBe("typeLiteral0");
    expect(parsed.suffix).toBe("meta");
  });

  test("parses a top-level exported term", () => {
    const parsed = parseSymbol(HEADER + "src/`animal.ts`/answer.");
    expect(parsed.displayName).toBe("answer");
    expect(parsed.suffix).toBe("term");
    expect(parsed.enclosing).toBe(HEADER + "src/`animal.ts`/");
  });

  test("treats a module-private function as a global symbol, not local", () => {
    const parsed = parseSymbol(HEADER + "src/`animal.ts`/privateHelper().");
    expect(parsed.isLocal).toBe(false);
    expect(parsed.displayName).toBe("privateHelper");
    expect(parsed.suffix).toBe("method");
  });

  test("parses a local symbol", () => {
    const parsed = parseSymbol("local 2");
    expect(parsed.isLocal).toBe(true);
    expect(parsed.scheme).toBe("local");
    expect(parsed.displayName).toBe("2");
    expect(parsed.descriptors).toEqual([]);
    expect(parsed.suffix).toBeNull();
  });

  test("maps the dot placeholder in package fields to empty", () => {
    const parsed = parseSymbol("semanticdb . . . com/example/Foo#");
    expect(parsed.scheme).toBe("semanticdb");
    expect(parsed.manager).toBe("");
    expect(parsed.packageName).toBe("");
    expect(parsed.version).toBe("");
    expect(parsed.displayName).toBe("Foo");
  });
});

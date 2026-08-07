import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "./version";

const rootPkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "package.json"), "utf-8"));

describe("VERSION", () => {
  test("resolves to the monorepo umbrella package version", () => {
    expect(VERSION).toBe(rootPkg.version);
  });

  test("is a non-empty semantic-ish version string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

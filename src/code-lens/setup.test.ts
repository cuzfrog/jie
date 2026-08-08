import { unavailabilityGuidance } from "./setup";

describe("unavailabilityGuidance", () => {
  const guidance = unavailabilityGuidance("some/project/index.scip");

  test("states that code-lens is unavailable and names the missing index", () => {
    expect(guidance).toContain("code-lens is not available");
    expect(guidance).toContain("some/project/index.scip");
  });

  test("covers every supported language with an indexer command", () => {
    expect(guidance).toContain("scip-typescript index");
    expect(guidance).toContain("scip-python index");
    expect(guidance).toContain("scip-java index");
    expect(guidance).toContain("cargo install scip");
    expect(guidance).toContain("scip-go");
  });

  test("mentions the output file name", () => {
    expect(guidance).toContain("index.scip");
  });
});

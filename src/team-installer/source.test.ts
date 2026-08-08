import { parseNpmSpec, parseTeamSource } from "./source";

describe("parseTeamSource", () => {
  test("file: relative, absolute, and home paths", () => {
    expect(parseTeamSource("./teams/dev")).toEqual({ kind: "file", path: "./teams/dev" });
    expect(parseTeamSource("../teams/dev")).toEqual({ kind: "file", path: "../teams/dev" });
    expect(parseTeamSource("/abs/team")).toEqual({ kind: "file", path: "/abs/team" });
    expect(parseTeamSource("~/teams/dev")).toEqual({ kind: "file", path: "~/teams/dev" });
  });

  test("git: github shorthand is normalized to an https url", () => {
    expect(parseTeamSource("github:owner/repo")).toEqual({
      kind: "git",
      url: "https://github.com/owner/repo.git",
      ref: undefined,
    });
  });

  test("git: github shorthand with a ref", () => {
    expect(parseTeamSource("github:owner/repo#v1.2.3")).toEqual({
      kind: "git",
      url: "https://github.com/owner/repo.git",
      ref: "v1.2.3",
    });
  });

  test("git: https url keeps its location, splits a trailing ref", () => {
    expect(parseTeamSource("https://example.com/repo.git")).toEqual({
      kind: "git",
      url: "https://example.com/repo.git",
      ref: undefined,
    });
    expect(parseTeamSource("https://example.com/repo#main")).toEqual({
      kind: "git",
      url: "https://example.com/repo",
      ref: "main",
    });
  });

  test("npm: scoped and unscoped packages, with optional version", () => {
    expect(parseTeamSource("@cuzfrog/jie-team")).toEqual({ kind: "npm", spec: "@cuzfrog/jie-team" });
    expect(parseTeamSource("@cuzfrog/jie-team@0.9.0")).toEqual({ kind: "npm", spec: "@cuzfrog/jie-team@0.9.0" });
    expect(parseTeamSource("some-team")).toEqual({ kind: "npm", spec: "some-team" });
  });

  test("trims surrounding whitespace", () => {
    expect(parseTeamSource("  @cuzfrog/jie-team  ")).toEqual({ kind: "npm", spec: "@cuzfrog/jie-team" });
  });

  test("rejects an empty spec", () => {
    expect(() => parseTeamSource("")).toThrow("empty team source");
    expect(() => parseTeamSource("   ")).toThrow("empty team source");
  });
});

describe("parseNpmSpec", () => {
  test("unscoped name defaults to latest", () => {
    expect(parseNpmSpec("some-team")).toEqual({ name: "some-team", versionRange: "latest" });
  });

  test("unscoped name with version splits on the last @", () => {
    expect(parseNpmSpec("some-team@0.9.0")).toEqual({ name: "some-team", versionRange: "0.9.0" });
  });

  test("scoped name without version keeps the scope in the name", () => {
    expect(parseNpmSpec("@cuzfrog/jie-team")).toEqual({ name: "@cuzfrog/jie-team", versionRange: "latest" });
  });

  test("scoped name with version splits after the scope", () => {
    expect(parseNpmSpec("@cuzfrog/jie-team@next")).toEqual({ name: "@cuzfrog/jie-team", versionRange: "next" });
    expect(parseNpmSpec("@cuzfrog/jie-team@0.9.0")).toEqual({ name: "@cuzfrog/jie-team", versionRange: "0.9.0" });
  });
});

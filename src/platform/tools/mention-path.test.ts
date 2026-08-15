import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JiePlatformError } from "../jie-platform-errors";
import { expandMentionPath, _matchMention, _parseMention } from "./mention-path";
import type { ScannedFile } from "../../utils";

function makeScanned(rel: string): ScannedFile {
  return { absPath: `/w/${rel}`, relPath: rel };
}

describe("_parseMention", () => {
  test("returns null for a plain path", () => {
    expect(_parseMention("src/main.ts")).toBeNull();
  });

  test("parses a single @ as a tracked-file mention", () => {
    expect(_parseMention("@main.ts")).toEqual({ onlyIgnored: false, query: "main.ts" });
  });

  test("parses @@ as an ignored-file mention", () => {
    expect(_parseMention("@@main.ts")).toEqual({ onlyIgnored: true, query: "main.ts" });
  });
});

describe("_matchMention", () => {
  const candidates = [
    makeScanned("src/main.ts"),
    makeScanned("Main.ts"),
    makeScanned("lib/main.ts"),
    makeScanned("other.ts"),
  ];

  test("returns exact matches first", () => {
    const matches = _matchMention("src/main.ts", candidates);
    expect(matches).toEqual([makeScanned("src/main.ts")]);
  });

  test("falls back to case-insensitive exact", () => {
    const matches = _matchMention("main.ts", candidates);
    expect(matches.length).toBe(1);
    expect(matches[0]!.relPath).toBe("Main.ts");
  });

  test("falls back to a unique suffix", () => {
    const matches = _matchMention("other.ts", candidates);
    expect(matches).toEqual([makeScanned("other.ts")]);
  });

  test("returns multiple candidates for an ambiguous suffix", () => {
    const suffixCandidates = [makeScanned("src/main.ts"), makeScanned("lib/main.ts"), makeScanned("other.ts")];
    const matches = _matchMention("main.ts", suffixCandidates);
    expect(matches.length).toBe(2);
    expect(matches.some((file) => file.relPath === "src/main.ts")).toBe(true);
    expect(matches.some((file) => file.relPath === "lib/main.ts")).toBe(true);
  });
});

describe("expandMentionPath", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-mention-"));
    mkdirSync(join(workspace, "src"));
    mkdirSync(join(workspace, "lib"));
    writeFileSync(join(workspace, "src", "main.ts"), "x");
    writeFileSync(join(workspace, "lib", "main.ts"), "x");
    writeFileSync(join(workspace, "README.md"), "x");
    writeFileSync(join(workspace, ".gitignore"), "ignored.ts\n");
    writeFileSync(join(workspace, "ignored.ts"), "x");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("leaves a plain path unchanged", () => {
    expect(expandMentionPath("src/main.ts", workspace)).toBe("src/main.ts");
  });

  test("expands an exact @ mention", () => {
    expect(expandMentionPath("@src/main.ts", workspace)).toBe("src/main.ts");
  });

  test("expands a unique suffix @ mention", () => {
    expect(expandMentionPath("@README.md", workspace)).toBe("README.md");
  });

  test("expands @@ to an ignored file", () => {
    expect(expandMentionPath("@@ignored.ts", workspace)).toBe("ignored.ts");
  });

  test("throws for an ambiguous mention", () => {
    expect(() => expandMentionPath("@main.ts", workspace)).toThrow(JiePlatformError);
  });
});

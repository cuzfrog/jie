import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installBlueprint, listBlueprints } from "./installer";

function writeBlueprint(sourceDir: string, id: string, files: Record<string, string>): void {
  const dir = join(sourceDir, id);
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, "utf-8");
  }
}

describe("installer", () => {
  const tmpRoots: string[] = [];
  function track(path: string): string {
    tmpRoots.push(path);
    return path;
  }
  function freshDir(prefix: string): string {
    return track(mkdtempSync(join(tmpdir(), prefix)));
  }
  afterEach(() => {
    for (const path of tmpRoots) rmSync(path, { recursive: true, force: true });
    tmpRoots.length = 0;
  });

  describe("listBlueprints", () => {
    test("lists directories that contain a TEAM.md, sorted, skipping hidden entries", () => {
      const source = freshDir("jie-blueprints-");
      writeBlueprint(source, "dev", { "TEAM.md": "---\nleader: lead\n---\n" });
      writeBlueprint(source, "alpha", { "TEAM.md": "---\nleader: a\n---\n" });
      mkdirSync(join(source, "not-a-team"), { recursive: true });
      writeBlueprint(source, ".hidden", { "TEAM.md": "---\nleader: h\n---\n" });
      expect(listBlueprints(source)).toEqual(["alpha", "dev"]);
    });

    test("returns an empty list for a missing source directory", () => {
      expect(listBlueprints(join(tmpdir(), "does-not-exist-jie"))).toEqual([]);
    });

    test("finds the shipped blueprints from the package source", () => {
      expect(listBlueprints()).toContain("default-coders");
    });
  });

  describe("installBlueprint", () => {
    test("copies the blueprint manifests into <target>/teams/<id> and returns the dir", () => {
      const source = freshDir("jie-blueprints-");
      const teamMd = "---\nleader: lead\n---\n";
      const leadMd = "---\ntools:\n  - notify\n---\nYou lead.\n";
      writeBlueprint(source, "dev", { "TEAM.md": teamMd, "lead.md": leadMd, "notes.txt": "not a manifest" });
      const target = freshDir("jie-target-");

      const installed = installBlueprint("dev", target, source);

      expect(installed).toBe(join(target, "teams", "dev"));
      expect(readFileSync(join(installed, "TEAM.md"), "utf-8")).toBe(teamMd);
      expect(readFileSync(join(installed, "lead.md"), "utf-8")).toBe(leadMd);
    });

    test("rejects an invalid blueprint id", () => {
      expect(() => installBlueprint("../escape", freshDir("jie-target-"))).toThrow("invalid blueprint id: ../escape");
    });

    test("rejects an unknown blueprint", () => {
      const source = freshDir("jie-blueprints-");
      expect(() => installBlueprint("ghost", freshDir("jie-target-"), source)).toThrow(
        `blueprint 'ghost' not found in ${source}`,
      );
    });

    test("refuses to overwrite an already installed team", () => {
      const source = freshDir("jie-blueprints-");
      writeBlueprint(source, "dev", { "TEAM.md": "---\nleader: lead\n---\n" });
      const target = freshDir("jie-target-");
      installBlueprint("dev", target, source);
      expect(() => installBlueprint("dev", target, source)).toThrow(/already installed/);
    });
  });
});

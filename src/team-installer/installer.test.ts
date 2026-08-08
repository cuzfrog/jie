import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTeamInstaller, type InstallerDeps } from "./installer";

const deps = vi.mocked<InstallerDeps>({
  fetchJson: vi.fn(),
  fetchBinary: vi.fn(),
  runGit: vi.fn(),
  extractTar: vi.fn(),
});

function writeTeam(root: string, id: string, files: Record<string, string>): string {
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, "utf-8");
  }
  return dir;
}

describe("createTeamInstaller", () => {
  const tmpRoots: string[] = [];
  function freshDir(prefix: string): string {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    tmpRoots.push(dir);
    return dir;
  }
  afterEach(() => {
    for (const path of tmpRoots) rmSync(path, { recursive: true, force: true });
    tmpRoots.length = 0;
  });

  describe("install from a file source", () => {
    test("copies every <id>/TEAM.md directory and records provenance, returns the ids", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "alpha", { "TEAM.md": "---\nleader: lead\n---\n", "lead.md": "you lead" });
      writeTeam(source, "beta", { "TEAM.md": "---\nleader: lead\n---\n" });
      mkdirSync(join(source, "not-a-team"), { recursive: true });
      const teamsDir = freshDir("jie-teams-");

      const installed = await createTeamInstaller(deps).install(source, teamsDir);

      expect(installed).toEqual(["alpha", "beta"]);
      expect(readFileSync(join(teamsDir, "alpha", "TEAM.md"), "utf-8")).toBe("---\nleader: lead\n---\n");
      expect(readFileSync(join(teamsDir, "alpha", "lead.md"), "utf-8")).toBe("you lead");
      expect(existsSync(join(teamsDir, "alpha", ".source.json"))).toBe(true);
      expect(deps.fetchJson).not.toHaveBeenCalled();
      expect(deps.runGit).not.toHaveBeenCalled();
    });

    test("refuses to overwrite an installed team without --force", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "dev", { "TEAM.md": "---\nleader: lead\n---\n" });
      const teamsDir = freshDir("jie-teams-");
      await createTeamInstaller(deps).install(source, teamsDir);

      await expect(createTeamInstaller(deps).install(source, teamsDir)).rejects.toThrow(/already installed/);
    });

    test("overwrites an installed team with --force", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "dev", { "TEAM.md": "v1" });
      const teamsDir = freshDir("jie-teams-");
      await createTeamInstaller(deps).install(source, teamsDir);

      writeFileSync(join(source, "dev", "TEAM.md"), "v2", "utf-8");
      await createTeamInstaller(deps).install(source, teamsDir, { force: true });

      expect(readFileSync(join(teamsDir, "dev", "TEAM.md"), "utf-8")).toBe("v2");
    });

    test("rejects a reserved team id from the source", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "add", { "TEAM.md": "---\nleader: lead\n---\n" });
      const teamsDir = freshDir("jie-teams-");
      await expect(createTeamInstaller(deps).install(source, teamsDir)).rejects.toThrow(/reserved team id: add/);
    });

    test("rejects an invalid team id from the source", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "bad id", { "TEAM.md": "x" });
      const teamsDir = freshDir("jie-teams-");
      await expect(createTeamInstaller(deps).install(source, teamsDir)).rejects.toThrow(/invalid team id: bad id/);
    });

    test("errors when the source has no team manifests", async () => {
      const source = freshDir("jie-src-");
      mkdirSync(join(source, "empty"), { recursive: true });
      const teamsDir = freshDir("jie-teams-");
      await expect(createTeamInstaller(deps).install(source, teamsDir)).rejects.toThrow(/no team manifests/);
    });
  });

  describe("install from an npm source", () => {
    beforeEach(() => {
      deps.fetchJson.mockResolvedValue({
        "dist-tags": { latest: "0.9.0" },
        versions: { "0.9.0": { dist: { tarball: "https://example.com/pkg.tgz" } } },
      });
      deps.fetchBinary.mockResolvedValue(new Uint8Array([1, 2, 3]));
      deps.extractTar.mockImplementation(async (_tarball, destDir) => {
        writeTeam(destDir, "package", {});
        writeTeam(join(destDir, "package"), "shipped-team", { "TEAM.md": "---\nleader: lead\n---\n" });
      });
    });

    test("fetches metadata, downloads the tarball, and installs the packaged team", async () => {
      const teamsDir = freshDir("jie-teams-");
      const installed = await createTeamInstaller(deps).install("@cuzfrog/jie-team@latest", teamsDir);

      expect(installed).toEqual(["shipped-team"]);
      expect(deps.fetchJson).toHaveBeenCalledWith("https://registry.npmjs.org/@cuzfrog%2Fjie-team");
      expect(deps.fetchBinary).toHaveBeenCalledWith("https://example.com/pkg.tgz");
      expect(existsSync(join(teamsDir, "shipped-team", "TEAM.md"))).toBe(true);
    });

    test("resolves an exact version without consulting dist-tags", async () => {
      const teamsDir = freshDir("jie-teams-");
      await createTeamInstaller(deps).install("@cuzfrog/jie-team@0.9.0", teamsDir);

      expect(deps.fetchBinary).toHaveBeenCalledWith("https://example.com/pkg.tgz");
    });

    test("errors when the version is neither a dist-tag nor an exact version", async () => {
      const teamsDir = freshDir("jie-teams-");
      await expect(createTeamInstaller(deps).install("@cuzfrog/jie-team@9.9.9", teamsDir)).rejects.toThrow(
        /version '9.9.9' for @cuzfrog\/jie-team not found/,
      );
    });
  });

  describe("install from a git source", () => {
    test("clones shallowly and installs the discovered team", async () => {
      deps.runGit.mockImplementation((args, _cwd) => {
        const cloneDir = args[args.length - 1] as string;
        writeTeam(cloneDir, "git-team", { "TEAM.md": "---\nleader: lead\n---\n" });
        return { exitCode: 0, stdout: "", stderr: "" };
      });
      const teamsDir = freshDir("jie-teams-");

      const installed = await createTeamInstaller(deps).install("github:owner/repo#main", teamsDir);

      expect(installed).toEqual(["git-team"]);
      expect(deps.runGit).toHaveBeenCalledWith(
        ["clone", "--depth", "1", "--branch", "main", "https://github.com/owner/repo.git", expect.any(String)],
        expect.any(String),
      );
      expect(existsSync(join(teamsDir, "git-team", "TEAM.md"))).toBe(true);
    });

    test("clones the default branch when no ref is given", async () => {
      deps.runGit.mockImplementation((args, _cwd) => {
        const cloneDir = args[args.length - 1] as string;
        writeTeam(cloneDir, "git-team", { "TEAM.md": "---\nleader: lead\n---\n" });
        return { exitCode: 0, stdout: "", stderr: "" };
      });
      const teamsDir = freshDir("jie-teams-");

      await createTeamInstaller(deps).install("https://example.com/repo.git", teamsDir);

      expect(deps.runGit).toHaveBeenCalledWith(
        ["clone", "--depth", "1", "https://example.com/repo.git", expect.any(String)],
        expect.any(String),
      );
    });

    test("errors when git clone fails", async () => {
      deps.runGit.mockReturnValue({ exitCode: 128, stdout: "", stderr: "repo not found" });
      const teamsDir = freshDir("jie-teams-");
      await expect(createTeamInstaller(deps).install("github:owner/repo", teamsDir)).rejects.toThrow(
        /git clone of .* failed: repo not found/,
      );
    });
  });

  describe("remove", () => {
    test("deletes an installed team directory", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "dev", { "TEAM.md": "---\nleader: lead\n---\n" });
      const teamsDir = freshDir("jie-teams-");
      await createTeamInstaller(deps).install(source, teamsDir);

      createTeamInstaller(deps).remove("dev", teamsDir);

      expect(existsSync(join(teamsDir, "dev"))).toBe(false);
    });

    test("errors when the team is not installed", () => {
      const teamsDir = freshDir("jie-teams-");
      expect(() => createTeamInstaller(deps).remove("ghost", teamsDir)).toThrow(/not installed/);
    });

    test("rejects a reserved id", () => {
      const teamsDir = freshDir("jie-teams-");
      expect(() => createTeamInstaller(deps).remove("default-solo", teamsDir)).toThrow(/reserved team id: default-solo/);
    });
  });

  describe("readProvenance", () => {
    test("returns the recorded source for an installed team", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "dev", { "TEAM.md": "---\nleader: lead\n---\n" });
      const teamsDir = freshDir("jie-teams-");
      await createTeamInstaller(deps).install(source, teamsDir);

      const provenance = createTeamInstaller(deps).readProvenance("dev", teamsDir);

      expect(provenance).not.toBeNull();
      expect(provenance!.source).toEqual({ kind: "file", path: source });
      expect(provenance!.spec).toBe(source);
      expect(provenance!.installedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("returns null when no provenance exists", () => {
      const teamsDir = freshDir("jie-teams-");
      expect(createTeamInstaller(deps).readProvenance("dev", teamsDir)).toBeNull();
    });
  });
});

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createManifestInstaller, type InstallerDeps } from "./installer";

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

function writeAgent(root: string, id: string, content: string): string {
  const dir = join(root, "agents");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${id}.md`);
  writeFileSync(path, content, "utf-8");
  return path;
}

describe("createManifestInstaller", () => {
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
    test("v2 source installs teams and agents, writes provenance, returns the ids", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "alpha", { "TEAM.md": "---\nleader: lead\n---\n", "lead.md": "you lead" });
      writeTeam(source, "beta", { "TEAM.md": "---\nleader: lead\n---\n" });
      writeAgent(source, "explorer", "---\ntools:\n  - bash\n---\n");
      const jieDir = freshDir("jie-home-");

      const result = await createManifestInstaller(deps).install(source, jieDir);

      expect(result).toEqual({ teams: ["alpha", "beta"], agents: ["explorer"] });
      expect(readFileSync(join(jieDir, "teams", "alpha", "TEAM.md"), "utf-8")).toBe("---\nleader: lead\n---\n");
      expect(readFileSync(join(jieDir, "teams", "alpha", "lead.md"), "utf-8")).toBe("you lead");
      expect(readFileSync(join(jieDir, "agents", "explorer.md"), "utf-8")).toBe("---\ntools:\n  - bash\n---\n");
      expect(existsSync(join(jieDir, "teams", "alpha", ".source.json"))).toBe(true);
      expect(existsSync(join(jieDir, "agents", "explorer.source.json"))).toBe(true);
      expect(deps.fetchJson).not.toHaveBeenCalled();
      expect(deps.runGit).not.toHaveBeenCalled();
    });

    test("expands a leading ~ in a file source to the user's home", async () => {
      const fakeHome = freshDir("jie-fake-home-");
      const previousHome = process.env.HOME;
      process.env.HOME = fakeHome;
      const source = join(fakeHome, "manifest");
      writeTeam(source, "dev", { "TEAM.md": "---\nleader: lead\n---\n" });
      writeAgent(source, "explorer", "---\ntools:\n  - bash\n---\n");
      const jieDir = freshDir("jie-home-");

      try {
        const result = await createManifestInstaller(deps).install("~/manifest", jieDir);

        expect(result.teams).toEqual(["dev"]);
        expect(result.agents).toEqual(["explorer"]);
        expect(existsSync(join(jieDir, "teams", "dev", "TEAM.md"))).toBe(true);
        expect(existsSync(join(jieDir, "agents", "explorer.md"))).toBe(true);
      } finally {
        if (previousHome === undefined) delete process.env.HOME;
        else process.env.HOME = previousHome;
      }
    });

    test("legacy root-level team source still installs", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "legacy", { "TEAM.md": "---\nleader: lead\n---\n" });
      const jieDir = freshDir("jie-home-");

      const result = await createManifestInstaller(deps).install(source, jieDir);

      expect(result.teams).toEqual(["legacy"]);
      expect(existsSync(join(jieDir, "teams", "legacy", "TEAM.md"))).toBe(true);
    });

    test("agents-only source installs without error", async () => {
      const source = freshDir("jie-src-");
      writeAgent(source, "steward", "---\ntools:\n  - bash\n---\n");
      const jieDir = freshDir("jie-home-");

      const result = await createManifestInstaller(deps).install(source, jieDir);

      expect(result).toEqual({ teams: [], agents: ["steward"] });
      expect(existsSync(join(jieDir, "agents", "steward.md"))).toBe(true);
    });

    test("refuses to overwrite an installed team or agent without --force", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "dev", { "TEAM.md": "---\nleader: lead\n---\n" });
      writeAgent(source, "explorer", "---\ntools:\n  - bash\n---\n");
      const jieDir = freshDir("jie-home-");
      await createManifestInstaller(deps).install(source, jieDir);

      await expect(createManifestInstaller(deps).install(source, jieDir)).rejects.toThrow(/already installed/);
    });

    test("overwrites an installed team and agent with --force", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "dev", { "TEAM.md": "v1" });
      writeAgent(source, "explorer", "v1");
      const jieDir = freshDir("jie-home-");
      await createManifestInstaller(deps).install(source, jieDir);

      writeFileSync(join(source, "dev", "TEAM.md"), "v2", "utf-8");
      writeFileSync(join(source, "agents", "explorer.md"), "v2", "utf-8");
      await createManifestInstaller(deps).install(source, jieDir, { force: true });

      expect(readFileSync(join(jieDir, "teams", "dev", "TEAM.md"), "utf-8")).toBe("v2");
      expect(readFileSync(join(jieDir, "agents", "explorer.md"), "utf-8")).toBe("v2");
    });

    test("rejects a reserved team id from the source", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "add", { "TEAM.md": "---\nleader: lead\n---\n" });
      const jieDir = freshDir("jie-home-");
      await expect(createManifestInstaller(deps).install(source, jieDir)).rejects.toThrow(/reserved team id: add/);
    });

    test("rejects an invalid team id from the source", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "bad id", { "TEAM.md": "x" });
      const jieDir = freshDir("jie-home-");
      await expect(createManifestInstaller(deps).install(source, jieDir)).rejects.toThrow(/invalid team id: bad id/);
    });

    test("rejects an invalid agent id from the source", async () => {
      const source = freshDir("jie-src-");
      const agentsDir = join(source, "agents");
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(join(agentsDir, "bad id.md"), "---\ntools:\n  - bash\n---\n", "utf-8");
      const jieDir = freshDir("jie-home-");
      await expect(createManifestInstaller(deps).install(source, jieDir)).rejects.toThrow(/invalid agent id: bad id/);
    });

    test("errors when the source has no team or agent manifests", async () => {
      const source = freshDir("jie-src-");
      mkdirSync(join(source, "empty"), { recursive: true });
      const jieDir = freshDir("jie-home-");
      await expect(createManifestInstaller(deps).install(source, jieDir)).rejects.toThrow(/no team or agent manifests/);
    });

    test("legacy scan skips teams, agents, and dotdirs", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "legacy", { "TEAM.md": "---\nleader: lead\n---\n" });
      mkdirSync(join(source, "teams"), { recursive: true });
      mkdirSync(join(source, "agents"), { recursive: true });
      mkdirSync(join(source, ".dot"), { recursive: true });
      const jieDir = freshDir("jie-home-");

      const result = await createManifestInstaller(deps).install(source, jieDir);

      expect(result.teams).toEqual(["legacy"]);
    });

    test("invokes the validator for every team and agent before copying", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "alpha", { "TEAM.md": "---\nleader: lead\n---\n", "lead.md": "ok" });
      writeAgent(source, "explorer", "ok");
      const jieDir = freshDir("jie-home-");
      const validateTeamDir = vi.fn(() => ({ additionalAgentRefs: [] }));
      const validateAgentFile = vi.fn();
      const installer = createManifestInstaller(deps, { validateTeamDir, validateAgentFile });

      await installer.install(source, jieDir);

      expect(validateTeamDir).toHaveBeenCalledWith(join(source, "alpha"));
      expect(validateAgentFile).toHaveBeenCalledWith(join(source, "agents", "explorer.md"));
    });

    test("aborts before copying when a validator reports an unresolved additional-agent ref", async () => {
      const source = freshDir("jie-src-");
      const teamDir = join(source, "alpha");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n", "utf-8");
      const jieDir = freshDir("jie-home-");
      const validateTeamDir = vi.fn(() => ({ additionalAgentRefs: ["ghost"] }));
      const installer = createManifestInstaller(deps, { validateTeamDir, validateAgentFile: vi.fn() });

      await expect(installer.install(source, jieDir)).rejects.toThrow(
        /team 'alpha' references missing shared agent 'ghost'/,
      );
      expect(existsSync(join(jieDir, "teams", "alpha"))).toBe(false);
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
        writeAgent(join(destDir, "package"), "shipped-agent", "---\ntools:\n  - bash\n---\n");
      });
    });

    test("fetches metadata, downloads the tarball, and installs the packaged manifests", async () => {
      const jieDir = freshDir("jie-home-");
      const result = await createManifestInstaller(deps).install("@cuzfrog/jie-team@latest", jieDir);

      expect(result).toEqual({ teams: ["shipped-team"], agents: ["shipped-agent"] });
      expect(deps.fetchJson).toHaveBeenCalledWith("https://registry.npmjs.org/@cuzfrog%2Fjie-team");
      expect(deps.fetchBinary).toHaveBeenCalledWith("https://example.com/pkg.tgz");
      expect(existsSync(join(jieDir, "teams", "shipped-team", "TEAM.md"))).toBe(true);
      expect(existsSync(join(jieDir, "agents", "shipped-agent.md"))).toBe(true);
    });

    test("resolves an exact version without consulting dist-tags", async () => {
      const jieDir = freshDir("jie-home-");
      await createManifestInstaller(deps).install("@cuzfrog/jie-team@0.9.0", jieDir);

      expect(deps.fetchBinary).toHaveBeenCalledWith("https://example.com/pkg.tgz");
    });

    test("errors when the version is neither a dist-tag nor an exact version", async () => {
      const jieDir = freshDir("jie-home-");
      await expect(createManifestInstaller(deps).install("@cuzfrog/jie-team@9.9.9", jieDir)).rejects.toThrow(
        /version '9.9.9' for @cuzfrog\/jie-team not found/,
      );
    });
  });

  describe("install from a git source", () => {
    test("clones shallowly and installs the discovered manifests", async () => {
      deps.runGit.mockImplementation((args, _cwd) => {
        const cloneDir = args[args.length - 1] as string;
        writeTeam(cloneDir, "git-team", { "TEAM.md": "---\nleader: lead\n---\n" });
        writeAgent(cloneDir, "git-agent", "---\ntools:\n  - bash\n---\n");
        return { exitCode: 0, stdout: "", stderr: "" };
      });
      const jieDir = freshDir("jie-home-");

      const result = await createManifestInstaller(deps).install("github:owner/repo#main", jieDir);

      expect(result).toEqual({ teams: ["git-team"], agents: ["git-agent"] });
      expect(deps.runGit).toHaveBeenCalledWith(
        ["clone", "--depth", "1", "--branch", "main", "https://github.com/owner/repo.git", expect.any(String)],
        expect.any(String),
      );
      expect(existsSync(join(jieDir, "teams", "git-team", "TEAM.md"))).toBe(true);
      expect(existsSync(join(jieDir, "agents", "git-agent.md"))).toBe(true);
    });

    test("clones the default branch when no ref is given", async () => {
      deps.runGit.mockImplementation((args, _cwd) => {
        const cloneDir = args[args.length - 1] as string;
        writeTeam(cloneDir, "git-team", { "TEAM.md": "---\nleader: lead\n---\n" });
        return { exitCode: 0, stdout: "", stderr: "" };
      });
      const jieDir = freshDir("jie-home-");

      await createManifestInstaller(deps).install("https://example.com/repo.git", jieDir);

      expect(deps.runGit).toHaveBeenCalledWith(
        ["clone", "--depth", "1", "https://example.com/repo.git", expect.any(String)],
        expect.any(String),
      );
    });

    test("errors when git clone fails", async () => {
      deps.runGit.mockReturnValue({ exitCode: 128, stdout: "", stderr: "repo not found" });
      const jieDir = freshDir("jie-home-");
      await expect(createManifestInstaller(deps).install("github:owner/repo", jieDir)).rejects.toThrow(
        /git clone of .* failed: repo not found/,
      );
    });
  });

  describe("remove", () => {
    test("deletes an installed team directory", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "dev", { "TEAM.md": "---\nleader: lead\n---\n" });
      const jieDir = freshDir("jie-home-");
      await createManifestInstaller(deps).install(source, jieDir);

      createManifestInstaller(deps).remove("dev", jieDir);

      expect(existsSync(join(jieDir, "teams", "dev"))).toBe(false);
    });

    test("errors when the team is not installed", () => {
      const jieDir = freshDir("jie-home-");
      expect(() => createManifestInstaller(deps).remove("ghost", jieDir)).toThrow(/not installed/);
    });

    test("rejects a reserved id", () => {
      const jieDir = freshDir("jie-home-");
      expect(() => createManifestInstaller(deps).remove("setup-assistant", jieDir)).toThrow(/reserved team id: setup-assistant/);
    });
  });

  describe("readProvenance", () => {
    test("returns the recorded source for an installed team", async () => {
      const source = freshDir("jie-src-");
      writeTeam(source, "dev", { "TEAM.md": "---\nleader: lead\n---\n" });
      const jieDir = freshDir("jie-home-");
      await createManifestInstaller(deps).install(source, jieDir);

      const provenance = createManifestInstaller(deps).readProvenance("dev", jieDir);

      expect(provenance).not.toBeNull();
      expect(provenance!.source).toEqual({ kind: "file", path: source });
      expect(provenance!.spec).toBe(source);
      expect(provenance!.installedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("returns null when no provenance exists", () => {
      const jieDir = freshDir("jie-home-");
      expect(createManifestInstaller(deps).readProvenance("dev", jieDir)).toBeNull();
    });
  });
});

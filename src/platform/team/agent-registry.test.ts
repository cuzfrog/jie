import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistryImpl } from "./agent-registry";

describe("AgentRegistryImpl", () => {
  let workspace: string;
  let homeJieDir: string;
  let projectJieDir: string | null;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-agent-reg-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-agent-reg-home-"));
    projectJieDir = null;
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  function writeAgent(jieDir: string, id: string, content: string): void {
    const agentsDir = join(jieDir, "agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, `${id}.md`), content, "utf-8");
  }

  function createRegistry(home: string, project: string | null): AgentRegistryImpl {
    return new AgentRegistryImpl(home, project);
  }

  describe("resolve", () => {
    test("reads and parses an agent from the user agents dir", () => {
      writeAgent(homeJieDir, "explorer", "---\ntools:\n  - bash\n---\nbody");
      const registry = createRegistry(homeJieDir, projectJieDir);
      const soul = registry.resolve("explorer");
      expect(soul.role).toBe("explorer");
      expect(soul.tools).toEqual(["bash"]);
      expect(soul.systemPrompt).toBe("body");
    });

    test("project agent shadows the same id in user scope", () => {
      const projectDir = join(workspace, ".jie");
      writeAgent(homeJieDir, "explorer", "---\ntools:\n  - bash\n---\nuser");
      writeAgent(projectDir, "explorer", "---\ntools:\n  - ls\n---\nproject");
      const registry = createRegistry(homeJieDir, projectDir);
      const soul = registry.resolve("explorer");
      expect(soul.tools).toEqual(["ls"]);
      expect(soul.systemPrompt).toBe("project");
    });

    test("throws AGENT_NOT_FOUND when the id is missing", () => {
      const registry = createRegistry(homeJieDir, projectJieDir);
      expect(() => registry.resolve("ghost")).toThrow(expect.objectContaining({ code: "AGENT_NOT_FOUND" }));
    });

    test("throws INVALID_AGENT_REF for an invalid id", () => {
      const registry = createRegistry(homeJieDir, projectJieDir);
      expect(() => registry.resolve("bad id")).toThrow(expect.objectContaining({ code: "INVALID_AGENT_REF" }));
    });

    test("propagates parser errors for invalid frontmatter", () => {
      writeAgent(homeJieDir, "broken", "no frontmatter");
      const registry = createRegistry(homeJieDir, projectJieDir);
      expect(() => registry.resolve("broken")).toThrow(expect.objectContaining({ code: "INVALID_FRONTMATTER" }));
    });
  });

  describe("listInstalled", () => {
    test("merges both scopes, dedupes, and ignores dotfiles and non-md", () => {
      const projectDir = join(workspace, ".jie");
      writeAgent(homeJieDir, "steward", "---\ntools:\n  - bash\n---\n");
      writeAgent(homeJieDir, "shared", "---\ntools:\n  - bash\n---\n");
      writeAgent(projectDir, "shared", "---\ntools:\n  - bash\n---\n");
      writeFileSync(join(projectDir, "agents", ".hidden"), "", "utf-8");
      mkdirSync(join(projectDir, "agents", "dir"), { recursive: true });
      const registry = createRegistry(homeJieDir, projectDir);
      expect(registry.listInstalled()).toEqual(["shared", "steward"]);
    });

    test("returns an empty list when no agents dir exists", () => {
      const registry = createRegistry(homeJieDir, projectJieDir);
      expect(registry.listInstalled()).toEqual([]);
    });

    test("skips files with invalid stems", () => {
      const agentsDir = join(homeJieDir, "agents");
      mkdirSync(agentsDir, { recursive: true });
      writeFileSync(join(agentsDir, "ok.md"), "---\ntools:\n  - bash\n---\n", "utf-8");
      writeFileSync(join(agentsDir, "bad id.md"), "---\ntools:\n  - bash\n---\n", "utf-8");
      const registry = createRegistry(homeJieDir, projectJieDir);
      expect(registry.listInstalled()).toEqual(["ok"]);
    });
  });

  describe("locate", () => {
    test("returns project when present", () => {
      const projectDir = join(workspace, ".jie");
      writeAgent(projectDir, "explorer", "---\ntools:\n  - bash\n---\n");
      const registry = createRegistry(homeJieDir, projectDir);
      expect(registry.locate("explorer")).toBe("project");
    });

    test("returns user when only user has it", () => {
      writeAgent(homeJieDir, "explorer", "---\ntools:\n  - bash\n---\n");
      const registry = createRegistry(homeJieDir, projectJieDir);
      expect(registry.locate("explorer")).toBe("user");
    });

    test("returns null when absent", () => {
      const registry = createRegistry(homeJieDir, projectJieDir);
      expect(registry.locate("ghost")).toBeNull();
    });
  });
});

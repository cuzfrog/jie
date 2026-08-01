import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadContextFiles } from "./load-context-files";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function write(dir: string, name: string, content: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), content, "utf-8");
}

function under<T extends { path: string }>(files: ReadonlyArray<T>, dirs: ReadonlyArray<string>): T[] {
  return files.filter((f) => dirs.some((dir) => f.path.startsWith(dir)));
}

describe("loadContextFiles", () => {
  test("home files load first, then ancestor files ordered root-down-to-cwd", () => {
    const home = makeTempDir("jie-ctx-home-");
    const proj = makeTempDir("jie-ctx-proj-");
    const cwd = join(proj, "sub");
    write(home, "AGENTS.md", "home-agents");
    write(home, "CLAUDE.md", "home-claude");
    write(proj, "AGENTS.md", "proj-agents");
    write(cwd, "CLAUDE.md", "sub-claude");

    const files = loadContextFiles({ cwd, homeJieDir: home });
    const contents = under(files, [home, proj]).map((f) => f.content);
    expect(contents).toEqual(["home-agents", "home-claude", "proj-agents", "sub-claude"]);
  });

  test("reads AGENTS.md before CLAUDE.md within the same directory", () => {
    const home = makeTempDir("jie-ctx-home-");
    const cwd = makeTempDir("jie-ctx-cwd-");
    write(cwd, "CLAUDE.md", "claude");
    write(cwd, "AGENTS.md", "agents");

    const names = under(loadContextFiles({ cwd, homeJieDir: home }), [cwd]).map((f) => f.path.split("/").pop());
    expect(names).toEqual(["AGENTS.md", "CLAUDE.md"]);
  });

  test("directories without context files contribute nothing", () => {
    const home = makeTempDir("jie-ctx-home-");
    const cwd = makeTempDir("jie-ctx-cwd-");
    mkdirSync(join(cwd, "empty-child"), { recursive: true });

    expect(under(loadContextFiles({ cwd, homeJieDir: home }), [home, cwd])).toEqual([]);
  });

  test("a path is loaded at most once when the home dir is also a cwd ancestor", () => {
    const proj = makeTempDir("jie-ctx-proj-");
    const cwd = join(proj, "sub");
    write(proj, "AGENTS.md", "shared");
    mkdirSync(cwd, { recursive: true });

    const files = loadContextFiles({ cwd, homeJieDir: proj });
    const shared = files.filter((f) => f.path === join(proj, "AGENTS.md"));
    expect(shared).toHaveLength(1);
  });

  test("an unreadable context entry is skipped without throwing", () => {
    const home = makeTempDir("jie-ctx-home-");
    const cwd = makeTempDir("jie-ctx-cwd-");
    mkdirSync(join(cwd, "AGENTS.md"), { recursive: true });
    write(cwd, "CLAUDE.md", "readable");

    const files = under(loadContextFiles({ cwd, homeJieDir: home }), [home, cwd]);
    expect(files.map((f) => f.content)).toEqual(["readable"]);
  });

  test("returns nothing for the temp dirs when no context files exist there", () => {
    const home = makeTempDir("jie-ctx-home-");
    const cwd = makeTempDir("jie-ctx-cwd-");
    expect(under(loadContextFiles({ cwd, homeJieDir: home }), [home, cwd])).toEqual([]);
  });
});

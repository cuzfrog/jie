import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadHooksConfig } from "./load-hooks";

function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeSettings(dir: string, json: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "settings.json"), json, "utf-8");
}

describe("loadHooksConfig", () => {
  test("missing settings files yield an empty config and no diagnostics", () => {
    const homeJieDir = makeTempDir("jie-hooks-empty-");
    const result = loadHooksConfig({ homeJieDir, projectJieDir: null });
    expect(result.config.PreToolUse).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  test("reads the hooks key from the global settings.json", () => {
    const homeJieDir = makeTempDir("jie-hooks-global-");
    writeSettings(homeJieDir, JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "./s.sh" }] }] } }));
    const result = loadHooksConfig({ homeJieDir, projectJieDir: null });
    expect(result.config.Stop[0]!.hooks[0]!.command).toBe("./s.sh");
    expect(result.diagnostics).toEqual([]);
  });

  test("project matchers merge additively after global", () => {
    const homeJieDir = makeTempDir("jie-hooks-g-");
    const projectJieDir = makeTempDir("jie-hooks-p-");
    writeSettings(homeJieDir, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "bash", hooks: [{ type: "command", command: "g" }] }] } }));
    writeSettings(projectJieDir, JSON.stringify({ hooks: { PreToolUse: [{ matcher: "edit", hooks: [{ type: "command", command: "p" }] }] } }));
    const result = loadHooksConfig({ homeJieDir, projectJieDir });
    expect(result.config.PreToolUse.map((m) => m.hooks[0]!.command)).toEqual(["g", "p"]);
  });

  test("an invalid handler yields a diagnostic carrying the offending file path", () => {
    const homeJieDir = makeTempDir("jie-hooks-bad-");
    writeSettings(homeJieDir, JSON.stringify({ hooks: { PreToolUse: [{ hooks: [{ type: "nope" }] }] } }));
    const result = loadHooksConfig({ homeJieDir, projectJieDir: null });
    expect(result.config.PreToolUse).toEqual([]);
    expect(result.diagnostics.some((d) => d.path === join(homeJieDir, "settings.json"))).toBe(true);
  });
});

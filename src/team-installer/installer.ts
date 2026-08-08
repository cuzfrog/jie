import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseNpmSpec, parseTeamSource, type TeamSource } from "./source";

const TEAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const RESERVED_TEAM_IDS = new Set(["add", "list", "remove", "default-solo"]);
const NPM_REGISTRY = "https://registry.npmjs.org";

export interface TeamProvenance {
  readonly source: TeamSource;
  readonly spec: string;
  readonly installedAt: string;
}

export interface InstallOptions {
  readonly force?: boolean;
}

export interface GitResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface InstallerDeps {
  readonly fetchJson: (url: string) => Promise<unknown>;
  readonly fetchBinary: (url: string) => Promise<Uint8Array>;
  readonly runGit: (args: readonly string[], cwd: string) => GitResult;
  readonly extractTar: (tarball: Uint8Array, destDir: string) => Promise<void>;
}

export interface TeamInstaller {
  install(spec: string, teamsDir: string, options?: InstallOptions): Promise<readonly string[]>;
  remove(teamId: string, teamsDir: string): void;
  readProvenance(teamId: string, teamsDir: string): TeamProvenance | null;
}

export function createTeamInstaller(deps: InstallerDeps = defaultInstallerDeps): TeamInstaller {
  return {
    async install(spec, teamsDir, options = {}) {
      const source = parseTeamSource(spec);
      const workDir = mkdtempSync(join(tmpdir(), "jie-install-"));
      try {
        const resolvedDir = await resolveTeamSource(source, deps, workDir);
        const ids = listTeamManifests(resolvedDir);
        if (ids.length === 0) {
          throw new Error(`no team manifests found in '${spec}' (expected one or more <id>/TEAM.md directories)`);
        }
        const installed: string[] = [];
        for (const id of ids) {
          validateTeamId(id);
          const destDir = join(teamsDir, id);
          if (existsSync(destDir) && !options.force) {
            throw new Error(`team '${id}' already installed at ${destDir} (use --force to overwrite)`);
          }
          rmSync(destDir, { recursive: true, force: true });
          copyManifest(join(resolvedDir, id), destDir);
          writeProvenance(destDir, source, spec, new Date().toISOString());
          installed.push(id);
        }
        return installed;
      } finally {
        rmSync(workDir, { recursive: true, force: true });
      }
    },
    remove(teamId, teamsDir) {
      validateTeamId(teamId);
      const destDir = join(teamsDir, teamId);
      if (!existsSync(destDir)) throw new Error(`team '${teamId}' is not installed`);
      rmSync(destDir, { recursive: true, force: true });
    },
    readProvenance(teamId, teamsDir) {
      validateTeamId(teamId);
      return readProvenanceFile(teamId, teamsDir);
    },
  };
}

export const defaultInstallerDeps: InstallerDeps = {
  fetchJson: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`fetch ${url} failed: ${response.status}`);
    return response.json();
  },
  fetchBinary: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`fetch ${url} failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  },
  runGit: (args, cwd) => runGitSync(args, cwd),
  extractTar: (tarball, destDir) => extractTarToDir(tarball, destDir),
};

async function resolveTeamSource(source: TeamSource, deps: InstallerDeps, workDir: string): Promise<string> {
  switch (source.kind) {
    case "npm": return resolveNpm(source, deps, workDir);
    case "git": return resolveGit(source, deps, workDir);
    case "file": return resolveFile(source);
  }
}

async function resolveNpm(source: { readonly spec: string }, deps: InstallerDeps, workDir: string): Promise<string> {
  const { name, versionRange } = parseNpmSpec(source.spec);
  const url = `${NPM_REGISTRY}/${registryPath(name)}`;
  const manifest = asRecord(await deps.fetchJson(url));
  const version = resolveNpmVersion(manifest, name, versionRange);
  const versions = asRecord(manifest.versions);
  const entry = asRecord(versions[version]);
  const dist = asRecord(entry.dist);
  const tarballUrl = asString(dist.tarball);
  const tarball = await deps.fetchBinary(tarballUrl);
  const extractDir = join(workDir, "npm-extract");
  await deps.extractTar(tarball, extractDir);
  const pkgDir = join(extractDir, "package");
  if (!existsSync(pkgDir)) throw new Error(`npm tarball for ${name} did not contain a 'package/' directory`);
  return pkgDir;
}

function resolveGit(source: { readonly url: string; readonly ref: string | undefined }, deps: InstallerDeps, workDir: string): string {
  const cloneDir = join(workDir, "git-clone");
  const args = source.ref === undefined
    ? ["clone", "--depth", "1", source.url, cloneDir]
    : ["clone", "--depth", "1", "--branch", source.ref, source.url, cloneDir];
  const result = deps.runGit(args, workDir);
  if (result.exitCode !== 0) throw new Error(`git clone of ${source.url} failed: ${result.stderr}`);
  return cloneDir;
}

function resolveFile(source: { readonly path: string }): string {
  if (!existsSync(source.path)) throw new Error(`file source not found: ${source.path}`);
  if (!statSync(source.path).isDirectory()) throw new Error(`file source is not a directory: ${source.path}`);
  return source.path;
}

function resolveNpmVersion(manifest: Record<string, unknown>, name: string, versionRange: string): string {
  if (manifest["dist-tags"] !== undefined) {
    const tag = asRecord(manifest["dist-tags"])[versionRange];
    if (typeof tag === "string") return tag;
  }
  if (manifest.versions !== undefined && asRecord(manifest.versions)[versionRange] !== undefined) {
    return versionRange;
  }
  throw new Error(`npm version '${versionRange}' for ${name} not found (expected a dist-tag or exact version)`);
}

function registryPath(name: string): string {
  return name.includes("/") ? name.replace("/", "%2F") : name;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("expected object in npm manifest");
  return value as Record<string, unknown>;
}

function asString(value: unknown): string {
  if (typeof value !== "string") throw new Error("expected string in npm manifest");
  return value;
}

function listTeamManifests(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const entry of entries.sort()) {
    if (entry.startsWith(".")) continue;
    if (!statSync(join(dir, entry)).isDirectory()) continue;
    if (!existsSync(join(dir, entry, "TEAM.md"))) continue;
    ids.push(entry);
  }
  return ids;
}

function copyManifest(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir).sort()) {
    if (!entry.endsWith(".md")) continue;
    const srcPath = join(srcDir, entry);
    if (!statSync(srcPath).isFile()) continue;
    writeFileSync(join(destDir, entry), readFileSync(srcPath, "utf-8"), "utf-8");
  }
}

function writeProvenance(destDir: string, source: TeamSource, spec: string, installedAt: string): void {
  const provenance: TeamProvenance = { source, spec, installedAt };
  writeFileSync(join(destDir, ".source.json"), JSON.stringify(provenance, null, 2), "utf-8");
}

function readProvenanceFile(teamId: string, teamsDir: string): TeamProvenance | null {
  const path = join(teamsDir, teamId, ".source.json");
  if (!existsSync(path)) return null;
  return toTeamProvenance(JSON.parse(readFileSync(path, "utf-8")));
}

function toTeamProvenance(raw: unknown): TeamProvenance | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const source = toTeamSource(record.source);
  if (source === null) return null;
  if (typeof record.spec !== "string" || typeof record.installedAt !== "string") return null;
  return { source, spec: record.spec, installedAt: record.installedAt };
}

function toTeamSource(raw: unknown): TeamSource | null {
  if (typeof raw !== "object" || raw === null) return null;
  const record = raw as Record<string, unknown>;
  switch (record.kind) {
    case "npm": return typeof record.spec === "string" ? { kind: "npm", spec: record.spec } : null;
    case "git":
      return typeof record.url === "string"
        ? { kind: "git", url: record.url, ref: typeof record.ref === "string" ? record.ref : undefined }
        : null;
    case "file": return typeof record.path === "string" ? { kind: "file", path: record.path } : null;
    default: return null;
  }
}

function validateTeamId(id: string): void {
  if (!TEAM_ID_PATTERN.test(id)) throw new Error(`invalid team id: ${id}`);
  if (RESERVED_TEAM_IDS.has(id)) throw new Error(`reserved team id: ${id}`);
}

function runGitSync(args: readonly string[], cwd: string): GitResult {
  const proc = Bun.spawnSync({ cmd: ["git", ...args], cwd, stdout: "pipe", stderr: "pipe" });
  return { exitCode: proc.exitCode ?? 1, stdout: new TextDecoder().decode(proc.stdout).trim(), stderr: new TextDecoder().decode(proc.stderr).trim() };
}

async function extractTarToDir(tarball: Uint8Array, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  const tmpDir = mkdtempSync(join(tmpdir(), "jie-tar-"));
  try {
    const tarPath = join(tmpDir, "pkg.tgz");
    await Bun.write(tarPath, tarball);
    const proc = Bun.spawnSync({ cmd: ["tar", "-xzf", tarPath, "-C", destDir], stdout: "pipe", stderr: "pipe" });
    if ((proc.exitCode ?? 1) !== 0) {
      throw new Error(`tar extract failed: ${new TextDecoder().decode(proc.stderr).trim()}`);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

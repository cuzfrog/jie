import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { parseNpmSpec, parseManifestSource, type ManifestSource } from "./source";

const TEAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const AGENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED_TEAM_IDS = new Set(["add", "list", "remove", "default-solo"]);
const NPM_REGISTRY = "https://registry.npmjs.org";

export interface ManifestProvenance {
  readonly source: ManifestSource;
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
  readonly fetchJson: (url: string) => Promise<Record<string, unknown>>;
  readonly fetchBinary: (url: string) => Promise<Uint8Array>;
  readonly runGit: (args: readonly string[], cwd: string) => GitResult;
  readonly extractTar: (tarball: Uint8Array, destDir: string) => Promise<void>;
}

export interface InstallResult {
  readonly teams: ReadonlyArray<string>;
  readonly agents: ReadonlyArray<string>;
}

interface TeamSourceEntry {
  readonly id: string;
  readonly sourceDir: string;
}

interface ValidatedTeam {
  readonly additionalAgentRefs: ReadonlyArray<string>;
}

interface ManifestValidator {
  validateTeamDir(sourceDir: string): ValidatedTeam;
  validateAgentFile(path: string): void;
}

export interface ManifestInstaller {
  install(spec: string, jieDir: string, options?: InstallOptions): Promise<InstallResult>;
  remove(teamId: string, jieDir: string): void;
  readProvenance(teamId: string, jieDir: string): ManifestProvenance | null;
}

export function createManifestInstaller(
  deps: InstallerDeps = defaultInstallerDeps,
  validator?: ManifestValidator,
): ManifestInstaller {
  return {
    async install(spec, jieDir, options = {}) {
      const source = parseManifestSource(spec);
      const workDir = mkdtempSync(join(tmpdir(), "jie-install-"));
      try {
        const resolvedDir = await resolveManifestSource(source, deps, workDir);
        const teamEntries = listTeamManifests(resolvedDir);
        const agentIds = listAgentManifests(resolvedDir);
        if (teamEntries.length === 0 && agentIds.length === 0) {
          throw new Error(`no team or agent manifests found in '${spec}' (expected one or more <id>/TEAM.md directories or agents/<id>.md files)`);
        }
        const validatedTeams: { entry: TeamSourceEntry; additionalAgentRefs: ReadonlyArray<string> }[] = [];
        for (const entry of teamEntries) {
          validateTeamId(entry.id);
          const validated = validator === undefined ? { additionalAgentRefs: [] as string[] } : validator.validateTeamDir(entry.sourceDir);
          validatedTeams.push({ entry, additionalAgentRefs: validated.additionalAgentRefs });
        }
        for (const id of agentIds) {
          validateAgentId(id);
          if (validator !== undefined) validator.validateAgentFile(join(resolvedDir, "agents", `${id}.md`));
        }
        validateAdditionalAgentRefs(validatedTeams, agentIds, jieDir);
        const teams: string[] = [];
        for (const { entry } of validatedTeams) {
          const destDir = join(jieDir, "teams", entry.id);
          if (existsSync(destDir) && !options.force) {
            throw new Error(`team '${entry.id}' already installed at ${destDir} (use --force to overwrite)`);
          }
          rmSync(destDir, { recursive: true, force: true });
          copyTeamManifest(entry.sourceDir, destDir);
          writeTeamProvenance(destDir, source, spec, new Date().toISOString());
          teams.push(entry.id);
        }
        const agents: string[] = [];
        for (const id of agentIds) {
          const agentsDir = join(jieDir, "agents");
          const destFile = join(agentsDir, `${id}.md`);
          if (existsSync(destFile) && !options.force) {
            throw new Error(`agent '${id}' already installed at ${destFile} (use --force to overwrite)`);
          }
          mkdirSync(agentsDir, { recursive: true });
          rmSync(destFile, { force: true });
          copyAgentManifest(join(resolvedDir, "agents", `${id}.md`), destFile);
          writeAgentProvenance(destFile, source, spec, new Date().toISOString());
          agents.push(id);
        }
        return { teams, agents };
      } finally {
        rmSync(workDir, { recursive: true, force: true });
      }
    },
    remove(teamId, jieDir) {
      validateTeamId(teamId);
      const destDir = join(jieDir, "teams", teamId);
      if (!existsSync(destDir)) throw new Error(`team '${teamId}' is not installed`);
      rmSync(destDir, { recursive: true, force: true });
    },
    readProvenance(teamId, jieDir) {
      validateTeamId(teamId);
      return readProvenanceFile(teamId, jieDir);
    },
  };
}

export const defaultInstallerDeps: InstallerDeps = {
  fetchJson: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`fetch ${url} failed: ${response.status}`);
    return assertRecord(await response.json());
  },
  fetchBinary: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`fetch ${url} failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  },
  runGit: (args, cwd) => runGitSync(args, cwd),
  extractTar: (tarball, destDir) => extractTarToDir(tarball, destDir),
};

async function resolveManifestSource(source: ManifestSource, deps: InstallerDeps, workDir: string): Promise<string> {
  switch (source.kind) {
    case "npm": return resolveNpm(source, deps, workDir);
    case "git": return resolveGit(source, deps, workDir);
    case "file": return resolveFile(source);
  }
}

async function resolveNpm(source: { readonly spec: string }, deps: InstallerDeps, workDir: string): Promise<string> {
  const { name, versionRange } = parseNpmSpec(source.spec);
  const url = `${NPM_REGISTRY}/${registryPath(name)}`;
  const manifest = await deps.fetchJson(url);
  const version = resolveNpmVersion(manifest, name, versionRange);
  const versions = assertRecord(manifest.versions);
  const entry = assertRecord(versions[version]);
  const dist = assertRecord(entry.dist);
  const tarballUrl = assertString(dist.tarball);
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
  const resolved = source.path.startsWith("~/")
    ? source.path.replace(/^~/, process.env.HOME ?? homedir())
    : source.path;
  if (!existsSync(resolved)) throw new Error(`file source not found: ${resolved}`);
  if (!statSync(resolved).isDirectory()) throw new Error(`file source is not a directory: ${resolved}`);
  return resolved;
}

function resolveNpmVersion(manifest: Record<string, unknown>, name: string, versionRange: string): string {
  if (manifest["dist-tags"] !== undefined) {
    const tag = assertRecord(manifest["dist-tags"])[versionRange];
    if (typeof tag === "string") return tag;
  }
  if (manifest.versions !== undefined && assertRecord(manifest.versions)[versionRange] !== undefined) {
    return versionRange;
  }
  throw new Error(`npm version '${versionRange}' for ${name} not found (expected a dist-tag or exact version)`);
}

function registryPath(name: string): string {
  return name.includes("/") ? name.replace("/", "%2F") : name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("expected object in npm manifest");
  return value;
}

function assertString(value: unknown): string {
  if (typeof value !== "string") throw new Error("expected string in npm manifest");
  return value;
}

function listTeamManifests(dir: string): TeamSourceEntry[] {
  const fromTeamsDir = listTeamManifestsFromTeamsDir(dir);
  const fromRoot = listTeamManifestsFromRoot(dir);
  const byId = new Map<string, TeamSourceEntry>();
  for (const entry of fromTeamsDir) byId.set(entry.id, entry);
  for (const entry of fromRoot) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function listTeamManifestsFromTeamsDir(dir: string): TeamSourceEntry[] {
  const teamsDir = join(dir, "teams");
  let entries: string[];
  try {
    entries = readdirSync(teamsDir);
  } catch {
    return [];
  }
  const ids: TeamSourceEntry[] = [];
  for (const entry of entries.sort()) {
    if (entry.startsWith(".")) continue;
    const sourceDir = join(teamsDir, entry);
    if (!statSync(sourceDir).isDirectory()) continue;
    if (!existsSync(join(sourceDir, "TEAM.md"))) continue;
    ids.push({ id: entry, sourceDir });
  }
  return ids;
}

function listTeamManifestsFromRoot(dir: string): TeamSourceEntry[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const ids: TeamSourceEntry[] = [];
  for (const entry of entries.sort()) {
    if (entry.startsWith(".")) continue;
    if (entry === "teams" || entry === "agents") continue;
    const sourceDir = join(dir, entry);
    if (!statSync(sourceDir).isDirectory()) continue;
    if (!existsSync(join(sourceDir, "TEAM.md"))) continue;
    ids.push({ id: entry, sourceDir });
  }
  return ids;
}

function listAgentManifests(dir: string): string[] {
  const agentsDir = join(dir, "agents");
  let entries: string[];
  try {
    entries = readdirSync(agentsDir);
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const entry of entries.sort()) {
    if (entry.startsWith(".")) continue;
    if (!entry.endsWith(".md")) continue;
    const srcPath = join(agentsDir, entry);
    if (!statSync(srcPath).isFile()) continue;
    const stem = entry.slice(0, -3);
    if (!AGENT_ID_PATTERN.test(stem)) throw new Error(`invalid agent id: ${stem}`);
    ids.push(stem);
  }
  return ids;
}

function copyTeamManifest(srcDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir).sort()) {
    if (!entry.endsWith(".md")) continue;
    const srcPath = join(srcDir, entry);
    if (!statSync(srcPath).isFile()) continue;
    writeFileSync(join(destDir, entry), readFileSync(srcPath, "utf-8"), "utf-8");
  }
}

function copyAgentManifest(srcPath: string, destPath: string): void {
  writeFileSync(destPath, readFileSync(srcPath, "utf-8"), "utf-8");
}

function writeTeamProvenance(destDir: string, source: ManifestSource, spec: string, installedAt: string): void {
  const provenance: ManifestProvenance = { source, spec, installedAt };
  writeFileSync(join(destDir, ".source.json"), JSON.stringify(provenance, null, 2), "utf-8");
}

function writeAgentProvenance(destFile: string, source: ManifestSource, spec: string, installedAt: string): void {
  const provenance: ManifestProvenance = { source, spec, installedAt };
  const provenancePath = join(dirname(destFile), `${basename(destFile, ".md")}.source.json`);
  writeFileSync(provenancePath, JSON.stringify(provenance, null, 2), "utf-8");
}

function readProvenanceFile(teamId: string, jieDir: string): ManifestProvenance | null {
  const path = join(jieDir, "teams", teamId, ".source.json");
  if (!existsSync(path)) return null;
  return toManifestProvenance(JSON.parse(readFileSync(path, "utf-8")));
}

function toManifestProvenance(raw: unknown): ManifestProvenance | null {
  if (!isRecord(raw)) return null;
  const source = toManifestSource(raw.source);
  if (source === null) return null;
  if (typeof raw.spec !== "string" || typeof raw.installedAt !== "string") return null;
  return { source, spec: raw.spec, installedAt: raw.installedAt };
}

function toManifestSource(raw: unknown): ManifestSource | null {
  if (!isRecord(raw)) return null;
  switch (raw.kind) {
    case "npm": return typeof raw.spec === "string" ? { kind: "npm", spec: raw.spec } : null;
    case "git":
      return typeof raw.url === "string"
        ? { kind: "git", url: raw.url, ref: typeof raw.ref === "string" ? raw.ref : undefined }
        : null;
    case "file": return typeof raw.path === "string" ? { kind: "file", path: raw.path } : null;
    default: return null;
  }
}

function validateTeamId(id: string): void {
  if (!TEAM_ID_PATTERN.test(id)) throw new Error(`invalid team id: ${id}`);
  if (RESERVED_TEAM_IDS.has(id)) throw new Error(`reserved team id: ${id}`);
}

function validateAgentId(id: string): void {
  if (!AGENT_ID_PATTERN.test(id)) throw new Error(`invalid agent id: ${id}`);
}

function validateAdditionalAgentRefs(
  teams: ReadonlyArray<{ readonly entry: TeamSourceEntry; readonly additionalAgentRefs: ReadonlyArray<string> }>,
  sourceAgentIds: ReadonlyArray<string>,
  jieDir: string,
): void {
  const sourceAgents = new Set(sourceAgentIds);
  for (const { entry, additionalAgentRefs } of teams) {
    for (const ref of additionalAgentRefs) {
      if (sourceAgents.has(ref)) continue;
      if (existsSync(join(jieDir, "agents", `${ref}.md`))) continue;
      throw new Error(`team '${entry.id}' references missing shared agent '${ref}'`);
    }
  }
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

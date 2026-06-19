import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { MergedSettings, RawSettings } from "./types.ts";
import { findProjectJieRoot, globalSettingsPath } from "./paths.ts";

/** A team is "installed" when its manifest dir exists and contains a
 *  `TEAM.md` file at the conventional location. */
function isTeamInstalled(
  teamId: string,
  projectPath: string,
  homeDir: string,
): boolean {
  const candidates = [
    join(projectPath, ".jie", "teams", teamId, "TEAM.md"),
    join(homeDir, ".jie", "teams", teamId, "TEAM.md"),
  ];
  return candidates.some((p) => existsSync(p));
}

/** Lists installed team ids under both project and global roots,
 *  deduped, sorted alphabetically. */
function listInstalledTeams(
  projectPath: string,
  homeDir: string,
): string[] {
  const ids = new Set<string>();
  for (const root of [join(projectPath, ".jie", "teams"), join(homeDir, ".jie", "teams")]) {
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (existsSync(join(root, entry, "TEAM.md"))) ids.add(entry);
    }
  }
  return [...ids].sort();
}

function readRawSettings(path: string): RawSettings | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as RawSettings;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

function writeRawSettings(path: string, value: RawSettings): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

/** Self-heals a stale `defaultTeam` in merged settings.
 *
 *  If `defaultTeam` is set and points to an installed team, returns
 *  `null` (no recovery needed).
 *
 *  If it is set but no installed team matches, picks the
 *  first-available user team (project + global, deduped, alphabetical)
 *  and writes it back to the scope (project or global) where the
 *  stale value lived. Returns the recovered team id. Logs the
 *  recovery via `console.warn`.
 *
 *  If no user teams are installed at all, removes the `defaultTeam`
 *  field from the same scope and returns `null` (the platform falls
 *  back to the built-in minimal team per the spec's selection order).
 */
export function resolveStaleDefaultTeam(
  mergedSettings: MergedSettings,
  projectPath: string,
  options: { homeDir?: string } = {},
): string | null {
  const staleId = mergedSettings.defaultTeam;
  if (staleId === undefined) return null;

  const homeDir = options.homeDir ?? process.env.HOME ?? "";
  if (isTeamInstalled(staleId, projectPath, homeDir)) return null;

  const projectRoot = findProjectJieRoot(projectPath) ?? projectPath;
  const projectPathFull = join(projectRoot, ".jie", "settings.json");
  const globalPathFull = globalSettingsPath(homeDir);

  const projectRaw = readRawSettings(projectPathFull);
  const globalRaw = readRawSettings(globalPathFull);

  const projectHasStale = projectRaw?.defaultTeam === staleId;
  const globalHasStale = globalRaw?.defaultTeam === staleId;
  const scopePath = projectHasStale
    ? projectPathFull
    : globalHasStale
      ? globalPathFull
      : null;
  const scopeLabel = projectHasStale ? "project" : "global";

  const available = listInstalledTeams(projectRoot, homeDir);
  if (available.length === 0) {
    if (scopePath !== null) clearDefaultTeam(scopePath);
    console.warn(
      `defaultTeam '${staleId}' is not installed; no user teams available; falling back to built-in minimal team`,
    );
    return null;
  }

  const recovered = available[0]!;
  if (scopePath !== null) {
    const source = scopePath === projectPathFull ? projectRaw : globalRaw;
    const next: RawSettings = { ...(source ?? {}) };
    next.defaultTeam = recovered;
    writeRawSettings(scopePath, next);
  }
  console.warn(
    `defaultTeam '${staleId}' is not installed; resetting to '${recovered}' in ${scopeLabel} settings`,
  );
  return recovered;
}

function clearDefaultTeam(path: string): void {
  const raw = readRawSettings(path);
  if (raw === null) return;
  delete raw.defaultTeam;
  writeRawSettings(path, raw);
}
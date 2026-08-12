import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isValidTeamId, loadDefaultSoloTeam, loadTeamFromDir } from "./parser";
import { JiePlatformError } from "../jie-platform-errors";
import { BUILTIN_DEFAULT_SOLO_TEAM_ID, type TeamBlueprint, type TeamBlueprintLocation } from "./types";
import type { AgentRegistry } from "./agent-registry";

export interface TeamRegistry {
  parseTeamManifest(teamId?: string): TeamBlueprint;
  listInstalled(): string[];
  locate(teamId: string): TeamBlueprintLocation;
}

export class TeamRegistryImpl implements TeamRegistry {
  private readonly userTeamsDir: string;

  constructor(
    homeJieDir: string,
    private readonly projectJieDir: string | null,
    private readonly agentRegistry: AgentRegistry,
  ) {
    this.userTeamsDir = join(homeJieDir, "teams");
  }

  parseTeamManifest(teamId?: string): TeamBlueprint {
    if (teamId === undefined || teamId === BUILTIN_DEFAULT_SOLO_TEAM_ID) {
      return loadDefaultSoloTeam();
    }
    if (!isValidTeamId(teamId)) {
      throw new JiePlatformError("INVALID_TEAM_ID", { detail: `invalid team_id: ${teamId}` });
    }
    const projectDir = this.projectTeamsDir();
    if (projectDir !== null && this.isProjectTeam(teamId)) {
      return this.parseFromDir(join(projectDir, teamId));
    }
    if (this.isUserTeam(teamId)) {
      return this.parseFromDir(join(this.userTeamsDir, teamId));
    }
    throw new JiePlatformError("TEAM_NOT_FOUND", { detail: `team '${teamId}' not found` });
  }

  listInstalled(): string[] {
    const ids = new Set<string>();
    ids.add(BUILTIN_DEFAULT_SOLO_TEAM_ID);
    for (const dir of [this.projectTeamsDir(), this.userTeamsDir]) {
      if (dir === null) continue;
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.startsWith(".")) continue;
        if (existsSync(join(dir, entry, "TEAM.md"))) ids.add(entry);
      }
    }
    return [...ids].sort();
  }

  locate(id: string): TeamBlueprintLocation {
    if (id === BUILTIN_DEFAULT_SOLO_TEAM_ID) return "builtin";
    if (this.isProjectTeam(id)) return "project";
    if (this.isUserTeam(id)) return "user";
    return null;
  }

  private projectTeamsDir(): string | null {
    return this.projectJieDir === null ? null : join(this.projectJieDir, "teams");
  }

  private isProjectTeam(id: string): boolean {
    const dir = this.projectTeamsDir();
    return dir !== null && existsSync(join(dir, id, "TEAM.md"));
  }

  private isUserTeam(id: string): boolean {
    return existsSync(join(this.userTeamsDir, id, "TEAM.md"));
  }

  private parseFromDir(dir: string): TeamBlueprint {
    const blueprint = loadTeamFromDir(dir);
    if (blueprint.roles.length === 0 && blueprint.additionalAgentRefs.length === 0) {
      return loadDefaultSoloTeam();
    }
    if (blueprint.additionalAgentRefs.length === 0) return blueprint;
    const sharedSouls = blueprint.additionalAgentRefs.map((ref) => {
      try {
        return this.agentRegistry.resolve(ref);
      } catch (error) {
        if (error instanceof JiePlatformError && error.code === "AGENT_NOT_FOUND") {
          throw new JiePlatformError("AGENT_NOT_FOUND", {
            detail: `team '${blueprint.id}' references missing shared agent '${ref}'`,
          });
        }
        throw error;
      }
    });
    const merged = [...blueprint.roles, ...sharedSouls].sort((a, b) => a.role.localeCompare(b.role));
    return { ...blueprint, roles: merged };
  }
}

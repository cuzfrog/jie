import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { BUILTIN_DEFAULT_SOLO_TEAM_ID, type AgentSoul, type TeamBlueprint } from "./types";
import { JiePlatformError } from "../jie-platform-errors";
import { isModelAlias, MODEL_ALIASES, parseModelRef } from "../types";
import DEFAULT_SOLO_TEAM_MD from "./default-solo/TEAM.md" with { type: "text" };
import DEFAULT_SOLO_GENERAL_MD from "./default-solo/general.md" with { type: "text" };

const TEAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const ROLE_STEM_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_REPLICAS = 8;

const FRONTMATTER_DELIMITER = "---";

export function isValidTeamId(id: string): boolean {
  return TEAM_ID_PATTERN.test(id);
}

export function isValidAgentId(id: string): boolean {
  return ROLE_STEM_PATTERN.test(id);
}

export interface ParseTeamOptions {
  readonly teamId: string;
  readonly sourceDir?: string;
}

export function parseTeamFromManifests(
  manifests: Record<string, string>,
  options: ParseTeamOptions,
): TeamBlueprint {
  const { teamId, sourceDir = "" } = options;

  if (!TEAM_ID_PATTERN.test(teamId)) {
    throw new JiePlatformError("INVALID_TEAM_ID", { detail: `invalid team_id: ${teamId}` });
  }

  const entries = Object.entries(manifests);
  const teamFile = entries.find(([name]) => name === "TEAM.md");
  const agentFiles = entries.filter(
    ([name]) => name !== "TEAM.md" && name.endsWith(".md"),
  );

  for (const [name] of agentFiles) {
    const stem = name.slice(0, -3);
    if (!ROLE_STEM_PATTERN.test(stem)) {
      throw new JiePlatformError("INVALID_ROLE", { detail: `invalid role: ${stem}` });
    }
  }

  const seenStems = new Set<string>();
  for (const [name] of agentFiles) {
    const stem = name.slice(0, -3);
    if (seenStems.has(stem)) {
      throw new JiePlatformError("DUPLICATE_ROLE", {
        detail: `duplicate role '${stem}' in ${sourceDir || teamId}`,
      });
    }
    seenStems.add(stem);
  }

  const roles: AgentSoul[] = [];
  for (const [name, content] of agentFiles) {
    const stem = name.slice(0, -3);
    const soul = parseAgentManifest(stem, content, name);
    roles.push(soul);
  }
  roles.sort((a, b) => a.role.localeCompare(b.role));

  let leaderRole: string | null = null;
  const roleStems = new Set(roles.map((r) => r.role));
  let additionalAgentRefs: string[] = [];

  if (teamFile !== undefined) {
    const teamContent = teamFile[1];
    const teamFrontmatter = parseTeamFile(teamContent, "TEAM.md");
    additionalAgentRefs = validateAdditionalAgentRefs(teamFrontmatter.additionalAgentRefs, roleStems, sourceDir || teamId);
    const leader = teamFrontmatter.leader;
    if (leader === null) {
      if (agentFiles.length >= 2) {
        throw new JiePlatformError("LEADER_REQUIRED", {
          detail: `TEAM.md 'leader' field is required (found no value in ${sourceDir || teamId})`,
        });
      }
      if (agentFiles.length === 1) {
        leaderRole = roles[0]!.role;
      }
    } else {
      if (agentFiles.length === 0) {
        throw new JiePlatformError("LEADER_UNKNOWN", {
          detail: `TEAM.md 'leader' field references unknown role '${leader}'; checked ${sourceDir || teamId}/`,
        });
      }
      if (agentFiles.length === 1) {
        const only = roles[0]!.role;
        if (leader !== only) {
          if (additionalAgentRefs.includes(leader)) {
            throw new JiePlatformError("LEADER_UNKNOWN", {
              detail: `TEAM.md 'leader' field references shared agent '${leader}'; shared agents cannot be team leaders (in ${sourceDir || teamId})`,
            });
          }
          throw new JiePlatformError("LEADER_MISMATCH", {
            detail: `TEAM.md 'leader' field '${leader}' does not match the single agent role '${only}' in ${sourceDir || teamId}`,
          });
        }
        leaderRole = only;
      } else {
        if (!roleStems.has(leader)) {
          throw new JiePlatformError("LEADER_UNKNOWN", {
            detail: `TEAM.md 'leader' field references unknown role '${leader}'; checked ${sourceDir || teamId}/`,
          });
        }
        leaderRole = leader;
      }
    }
  } else {
    if (agentFiles.length >= 2) {
      throw new JiePlatformError("TEAM_FILE_REQUIRED", {
        detail: `TEAM.md is required for multi-agent teams; no leader can be resolved (found ${agentFiles.length} agent files in ${sourceDir || teamId})`,
      });
    }
    if (agentFiles.length === 1) {
      leaderRole = roles[0]!.role;
    } else {
      leaderRole = null;
    }
  }

  if (leaderRole !== null) {
    const leaderSoul = roles.find((soul) => soul.role === leaderRole);
    if (leaderSoul !== undefined && leaderSoul.replicas !== 1) {
      throw new JiePlatformError("LEADER_REPLICA_FORBIDDEN", {
        detail: `leader role '${leaderRole}' has replica: ${leaderSoul.replicas}; leader must have replica: 1`,
      });
    }
  }

  return { id: teamId, roles, leaderRole, additionalAgentRefs };
}

export function loadTeamFromDir(dirPath: string): TeamBlueprint {
  const teamId = basename(dirPath);
  const manifests: Record<string, string> = {};
  for (const entry of readdirSync(dirPath).sort()) {
    if (!entry.endsWith(".md")) continue;
    const fullPath = join(dirPath, entry);
    if (!statSync(fullPath).isFile()) continue;
    manifests[entry] = readFileSync(fullPath, "utf-8");
  }
  return parseTeamFromManifests(manifests, {
    teamId,
    sourceDir: dirPath,
  });
}

export function loadDefaultSoloTeam(): TeamBlueprint {
  return parseTeamFromManifests(
    {
      "TEAM.md": DEFAULT_SOLO_TEAM_MD,
      "general.md": DEFAULT_SOLO_GENERAL_MD,
    },
    { teamId: BUILTIN_DEFAULT_SOLO_TEAM_ID },
  );
}

interface RawFrontmatter {
  model?: string;
  tools?: unknown;
  subscribe?: unknown;
  skills?: unknown;
  replica?: unknown;
  leader?: unknown;
  "additional-agents"?: unknown;
  target_context_window_size?: unknown;
}

interface TeamFrontmatter {
  leader: string | null;
  additionalAgentRefs: string[];
}

function splitFrontmatter(content: string): {
  frontmatter: RawFrontmatter | null;
  body: string;
} {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    return { frontmatter: null, body: content };
  }
  const closingIndex = lines.indexOf(FRONTMATTER_DELIMITER, 1);
  if (closingIndex === -1) {
    return { frontmatter: null, body: content };
  }
  const yamlText = lines.slice(1, closingIndex).join("\n");
  const body = lines.slice(closingIndex + 1).join("\n").replace(/^\n/, "");
  let frontmatter: RawFrontmatter | null;
  try {
    frontmatter = parseYaml(yamlText) as RawFrontmatter | null;
  } catch (error) {
    throw new JiePlatformError("INVALID_FRONTMATTER", {
      detail: `invalid frontmatter: ${(error as Error).message}`,
      cause: error as Error,
    });
  }
  if (frontmatter === null) frontmatter = {};
  return { frontmatter, body };
}

function asStringList(value: unknown, field: string, file: string): string[] {
  if (!Array.isArray(value)) {
    throw new JiePlatformError("INVALID_FIELD_TYPE", {
      detail: `${file}: field '${field}' must be a list of strings`,
    });
  }
  return value.map((v) => {
    if (typeof v !== "string") {
      throw new JiePlatformError("INVALID_FIELD_TYPE", {
        detail: `${file}: field '${field}' must be a list of strings`,
      });
    }
    return v;
  });
}

function asString(
  value: unknown,
  field: string,
  file: string,
): string {
  if (typeof value !== "string") {
    throw new JiePlatformError("INVALID_FIELD_TYPE", {
      detail: `${file}: field '${field}' must be a string`,
    });
  }
  return value;
}

function asPositiveInteger(
  value: unknown,
  field: string,
  file: string,
): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new JiePlatformError("INVALID_FIELD_TYPE", {
      detail: `${file}: field '${field}' must be a positive integer`,
    });
  }
  return value;
}

function validateAdditionalAgentRefs(refs: string[], roleStems: Set<string>, source: string): string[] {
  const seen = new Set<string>();
  for (const ref of refs) {
    if (!ROLE_STEM_PATTERN.test(ref)) {
      throw new JiePlatformError("INVALID_AGENT_REF", { detail: `invalid additional-agent ref: '${ref}' in ${source}` });
    }
    if (seen.has(ref)) {
      throw new JiePlatformError("DUPLICATE_AGENT_REF", { detail: `duplicate additional-agent ref '${ref}' in ${source}` });
    }
    if (roleStems.has(ref)) {
      throw new JiePlatformError("DUPLICATE_ROLE", { detail: `additional-agent ref '${ref}' collides with a local role in ${source}` });
    }
    seen.add(ref);
  }
  return refs;
}

export function parseAgentManifest(
  role: string,
  content: string,
  file: string,
): AgentSoul {
  const { frontmatter, body } = splitFrontmatter(content);
  if (frontmatter === null) {
    throw new JiePlatformError("INVALID_FRONTMATTER", {
      detail: `invalid frontmatter in ${file}: missing frontmatter block`,
    });
  }

  if (!("tools" in frontmatter) || frontmatter.tools === undefined) {
    throw new JiePlatformError("MISSING_REQUIRED_FIELD", {
      detail: `missing required field 'tools' in ${file}`,
    });
  }
  const tools = asStringList(frontmatter.tools, "tools", file);

  const subscribe =
    frontmatter.subscribe === undefined
      ? []
      : asStringList(frontmatter.subscribe, "subscribe", file);

  for (const topic of subscribe) {
    if (topic.startsWith("agent.")) {
      throw new JiePlatformError("SUBSCRIBE_REJECTS_PLATFORM_TOPIC", {
        detail: `subscribe_rejects_platform_topic: ${topic}`,
      });
    }
  }

  const model = frontmatter.model === undefined ? "" : asString(frontmatter.model, "model", file);

  if (model !== "" && parseModelRef(model) === null && !isModelAlias(model)) {
    throw new JiePlatformError("INVALID_MODEL_STRING", { detail: `invalid model string: ${model} (expected <provider>/<modelId> or one of: ${MODEL_ALIASES.join(", ")})` });
  }

  const skills = frontmatter.skills === undefined ? [] : asStringList(frontmatter.skills, "skills", file);

  const replicas = frontmatter.replica === undefined ? 1 : asPositiveInteger(frontmatter.replica, "replica", file);
  if (replicas > MAX_REPLICAS) {
    throw new JiePlatformError("REPLICA_LIMIT_EXCEEDED", {
      detail: `replica count ${replicas} exceeds maximum ${MAX_REPLICAS} in ${file}`,
    });
  }

  const targetContextWindowSize =
    frontmatter.target_context_window_size === undefined
      ? undefined
      : asPositiveInteger(frontmatter.target_context_window_size, "target_context_window_size", file);

  return {
    role,
    model,
    systemPrompt: body,
    tools,
    subscribe,
    skills,
    replicas,
    targetContextWindowSize,
  };
}

function parseTeamFile(content: string, file: string): TeamFrontmatter {
  const { frontmatter } = splitFrontmatter(content);
  if (frontmatter === null) {
    throw new JiePlatformError("INVALID_FRONTMATTER", {
      detail: `invalid frontmatter in ${file}: missing frontmatter block`,
    });
  }
  const leader = frontmatter.leader;
  const leaderRole = leader === undefined || leader === null || leader === "" ? null : asString(leader, "leader", file);
  const additionalAgentRefs = frontmatter["additional-agents"] === undefined ? [] : asStringList(frontmatter["additional-agents"], "additional-agents", file);
  return { leader: leaderRole, additionalAgentRefs };
}

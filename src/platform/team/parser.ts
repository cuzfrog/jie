import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { BUILTIN_SETUP_ASSISTANT_TEAM_ID, type AgentSoul, type TeamBlueprint } from "./types";
import { JiePlatformError } from "../jie-platform-errors";
import { isModelAlias, MODEL_ALIASES, parseModelRef, parseModelWithEffort, type EffortLevel } from "../types";
import SETUP_ASSISTANT_TEAM_MD from "./setup-assistant/TEAM.md" with { type: "text" };
import SETUP_ASSISTANT_GENERAL_MD from "./setup-assistant/general.md" with { type: "text" };

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
  let teamPrompt = "";
  let description: string | undefined;

  if (teamFile !== undefined) {
    const teamContent = teamFile[1];
    const teamParse = parseTeamFile(teamContent, "TEAM.md");
    additionalAgentRefs = validateAdditionalAgentRefs(teamParse.additionalAgentRefs, roleStems, sourceDir || teamId);
    teamPrompt = teamParse.body;
    if (teamParse.description !== null) description = teamParse.description;
    const leader = teamParse.leader;
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

  return { id: teamId, roles, leaderRole, additionalAgentRefs, teamPrompt, description };
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

export function loadSetupAssistantTeam(): TeamBlueprint {
  return parseTeamFromManifests(
    {
      "TEAM.md": SETUP_ASSISTANT_TEAM_MD,
      "general.md": SETUP_ASSISTANT_GENERAL_MD,
    },
    { teamId: BUILTIN_SETUP_ASSISTANT_TEAM_ID },
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
  description?: unknown;
  target_context_window_size?: unknown;
}

interface TeamFileParseResult {
  leader: string | null;
  additionalAgentRefs: string[];
  description: string | null;
  body: string;
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
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new JiePlatformError("INVALID_FRONTMATTER", {
      detail: `invalid frontmatter: ${message}`,
      cause: error instanceof Error ? error : new Error(message),
    });
  }
  if (raw === null) {
    return { frontmatter: {}, body };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new JiePlatformError("INVALID_FRONTMATTER", {
      detail: "frontmatter must be an object",
    });
  }
  const frontmatter = raw as RawFrontmatter;
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

function parseModelString(raw: string, file: string): { readonly model: string; readonly effort: EffortLevel | undefined } {
    const parsed = parseModelWithEffort(raw);
    if (parsed === null) {
        throw new JiePlatformError("INVALID_MODEL_STRING", { detail: `${file}: invalid model string: ${raw}` });
    }
    if (parsed.model !== "") validateModel(parsed.model, file);
    return parsed;
}

function validateModel(model: string, file: string): void {
  if (model !== "" && parseModelRef(model) === null && !isModelAlias(model)) {
    throw new JiePlatformError("INVALID_MODEL_STRING", { detail: `${file}: invalid model string: ${model} (expected <provider>/<modelId> or one of: ${MODEL_ALIASES.join(", ")})` });
  }
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

  const rawModel = frontmatter.model === undefined ? "" : asString(frontmatter.model, "model", file);
  const { model, effort } = parseModelString(rawModel, file);

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
    effort,
    systemPrompt: body,
    tools,
    subscribe,
    skills,
    replicas,
    targetContextWindowSize,
  };
}

function parseTeamFile(content: string, file: string): TeamFileParseResult {
  const { frontmatter, body } = splitFrontmatter(content);
  if (frontmatter === null) {
    throw new JiePlatformError("INVALID_FRONTMATTER", {
      detail: `invalid frontmatter in ${file}: missing frontmatter block`,
    });
  }
  const leader = frontmatter.leader;
  const leaderRole = leader === undefined || leader === null || leader === "" ? null : asString(leader, "leader", file);
  const additionalAgentRefs = frontmatter["additional-agents"] === undefined ? [] : asStringList(frontmatter["additional-agents"], "additional-agents", file);
  const description = frontmatter.description === undefined ? null : asString(frontmatter.description, "description", file);
  return { leader: leaderRole, additionalAgentRefs, description, body };
}

import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { AgentSoul, Team } from "./types.ts";

const TEAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const ROLE_STEM_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const FRONTMATTER_DELIMITER = "---";

export function isValidTeamId(id: string): boolean {
  return TEAM_ID_PATTERN.test(id);
}

interface RawFrontmatter {
  model?: string;
  tools?: unknown;
  subscribe?: unknown;
  leader?: unknown;
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
  } catch (e) {
    throw new Error(`invalid frontmatter: ${(e as Error).message}`);
  }
  if (frontmatter === null) frontmatter = {};
  return { frontmatter, body };
}

function asStringList(value: unknown, field: string, file: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${file}: field '${field}' must be a list of strings`);
  }
  return value.map((v) => {
    if (typeof v !== "string") {
      throw new Error(`${file}: field '${field}' must be a list of strings`);
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
    throw new Error(`${file}: field '${field}' must be a string`);
  }
  return value;
}

function parseAgentFile(
  role: string,
  content: string,
  file: string,
): AgentSoul {
  const { frontmatter, body } = splitFrontmatter(content);
  if (frontmatter === null) {
    throw new Error(`invalid frontmatter in ${file}: missing frontmatter block`);
  }

  if (!("tools" in frontmatter) || frontmatter.tools === undefined) {
    throw new Error(`missing required field 'tools' in ${file}`);
  }
  const tools = asStringList(frontmatter.tools, "tools", file);

  const subscribe =
    frontmatter.subscribe === undefined
      ? []
      : asStringList(frontmatter.subscribe, "subscribe", file);

  for (const topic of subscribe) {
    if (topic.startsWith("agent.")) {
      throw new Error(`subscribe_rejects_platform_topic: ${topic}`);
    }
  }

  const model = frontmatter.model === undefined ? "" : asString(frontmatter.model, "model", file);

  if (model !== "" && !model.includes("/")) {
    throw new Error(`invalid model string: ${model}`);
  }

  return {
    role,
    model,
    systemPrompt: body,
    tools,
    subscribe,
    subscriptions: [...subscribe],
  };
}

function parseTeamFile(
  content: string,
  file: string,
): { leader: string | null; frontmatter: RawFrontmatter | null } {
  const { frontmatter, body: _body } = splitFrontmatter(content);
  if (frontmatter === null) {
    throw new Error(`invalid frontmatter in ${file}: missing frontmatter block`);
  }
  const leader = frontmatter.leader;
  if (leader === undefined || leader === null || leader === "") {
    return { leader: null, frontmatter };
  }
  return { leader: asString(leader, "leader", file), frontmatter };
}

export interface ParseTeamOptions {

  teamId: string;

  sourceDir?: string;
}

export function parseTeamFromManifests(
  manifests: Record<string, string>,
  options: ParseTeamOptions,
): Team {
  const { teamId, sourceDir = "" } = options;

  if (!TEAM_ID_PATTERN.test(teamId)) {
    throw new Error(`invalid team_id: ${teamId}`);
  }

  const entries = Object.entries(manifests);
  const teamFile = entries.find(([name]) => name === "TEAM.md");
  const agentFiles = entries.filter(
    ([name]) => name !== "TEAM.md" && name.endsWith(".md"),
  );

  for (const [name] of agentFiles) {
    const stem = name.slice(0, -3);
    if (!ROLE_STEM_PATTERN.test(stem)) {
      throw new Error(`invalid role: ${stem}`);
    }
  }

  const seenStems = new Set<string>();
  for (const [name] of agentFiles) {
    const stem = name.slice(0, -3);
    if (seenStems.has(stem)) {
      throw new Error(`duplicate role '${stem}' in ${sourceDir || teamId}`);
    }
    seenStems.add(stem);
  }

  const roles: AgentSoul[] = [];
  for (const [name, content] of agentFiles) {
    const stem = name.slice(0, -3);
    const soul = parseAgentFile(stem, content, name);
    roles.push(soul);
  }
  roles.sort((a, b) => a.role.localeCompare(b.role));

  let leaderRole: string | null = null;

  if (teamFile !== undefined) {
    const teamContent = teamFile[1];
    const { leader } = parseTeamFile(teamContent, "TEAM.md");
    if (leader === null) {
      if (agentFiles.length >= 2) {
        throw new Error(
          `TEAM.md 'leader' field is required (found no value in ${sourceDir || teamId})`,
        );
      }
      if (agentFiles.length === 1) {
        leaderRole = roles[0]!.role;
      }
    } else {
      const roleStems = new Set(roles.map((r) => r.role));
      if (agentFiles.length === 0) {
        throw new Error(
          `TEAM.md 'leader' field references unknown role '${leader}'; checked ${sourceDir || teamId}/`,
        );
      }
      if (agentFiles.length === 1) {
        const only = roles[0]!.role;
        if (leader !== only) {
          throw new Error(
            `TEAM.md 'leader' field '${leader}' does not match the single agent role '${only}' in ${sourceDir || teamId}`,
          );
        }
        leaderRole = only;
      } else {
        if (!roleStems.has(leader)) {
          throw new Error(
            `TEAM.md 'leader' field references unknown role '${leader}'; checked ${sourceDir || teamId}/`,
          );
        }
        leaderRole = leader;
      }
    }
  } else {
    if (agentFiles.length >= 2) {
      throw new Error(
        `TEAM.md is required for multi-agent teams; no leader can be resolved (found ${agentFiles.length} agent files in ${sourceDir || teamId})`,
      );
    }
    if (agentFiles.length === 1) {
      leaderRole = roles[0]!.role;
    } else {
      leaderRole = null;
    }
  }

  return { id: teamId, roles, leaderRole };
}

export function loadTeamFromDir(dirPath: string): Team {
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

export function loadMinimalTeam(): Team {
  return parseTeamFromManifests(
    {
      "TEAM.md": MINIMAL_TEAM_MD,
      "general.md": MINIMAL_GENERAL_MD,
    },
    { teamId: "minimal" },
  );
}

import MINIMAL_TEAM_MD from "./minimal/TEAM.md" with { type: "text" };
import MINIMAL_GENERAL_MD from "./minimal/general.md" with { type: "text" };
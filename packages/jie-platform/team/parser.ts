import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { parse as parseYaml } from "yaml";
import { BUILTIN_DEFAULT_SOLO_TEAM_ID, type AgentSoul, type TeamBlueprint } from "./types";
import { JiePlatformError } from "../jie-platform-errors";
import type { TaskLifecycle, TaskTransitionRule, WriteGateRule } from "../types";
import DEFAULT_SOLO_TEAM_MD from "./default-solo/TEAM.md" with { type: "text" };
import DEFAULT_SOLO_GENERAL_MD from "./default-solo/general.md" with { type: "text" };

const TEAM_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const ROLE_STEM_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DEFAULT_MAX_ITERATIONS = 5;

const FRONTMATTER_DELIMITER = "---";

export function isValidTeamId(id: string): boolean {
  return TEAM_ID_PATTERN.test(id);
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
    const soul = parseAgentFile(stem, content, name);
    roles.push(soul);
  }
  roles.sort((a, b) => a.role.localeCompare(b.role));

  let leaderRole: string | null = null;
  let lifecycle: TaskLifecycle | null = null;
  const roleStems = new Set(roles.map((r) => r.role));

  if (teamFile !== undefined) {
    const teamContent = teamFile[1];
    const { leader, frontmatter } = parseTeamFile(teamContent, "TEAM.md");
    lifecycle =
      frontmatter.lifecycle === undefined || frontmatter.lifecycle === null
        ? null
        : parseLifecycle(frontmatter.lifecycle, roleStems, "TEAM.md");
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

  return { id: teamId, roles, leaderRole, lifecycle };
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
  leader?: unknown;
  lifecycle?: unknown;
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

function parseAgentFile(
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

  if (model !== "" && !model.includes("/")) {
    throw new JiePlatformError("INVALID_MODEL_STRING", { detail: `invalid model string: ${model}` });
  }

  const skills = frontmatter.skills === undefined ? [] : asStringList(frontmatter.skills, "skills", file);

  return {
    role,
    model,
    systemPrompt: body,
    tools,
    subscribe,
    skills,
  };
}

function parseTeamFile(
  content: string,
  file: string,
): { leader: string | null; frontmatter: RawFrontmatter } {
  const { frontmatter, body: _body } = splitFrontmatter(content);
  if (frontmatter === null) {
    throw new JiePlatformError("INVALID_FRONTMATTER", {
      detail: `invalid frontmatter in ${file}: missing frontmatter block`,
    });
  }
  const leader = frontmatter.leader;
  if (leader === undefined || leader === null || leader === "") {
    return { leader: null, frontmatter };
  }
  return { leader: asString(leader, "leader", file), frontmatter };
}

function parseLifecycle(value: unknown, roleStems: ReadonlySet<string>, file: string): TaskLifecycle {
  const block = asMapping(value, "lifecycle", file);
  const maxIterations = parseMaxIterations(block.max_iterations, file);
  const permanentPhases =
    block.permanent_phases === undefined ? [] : asStringList(block.permanent_phases, "lifecycle.permanent_phases", file);
  const transitions = parseTransitions(block.transitions, roleStems, file);
  const writeGates = parseWriteGates(block.write_gates, roleStems, file);
  return { maxIterations, permanentPhases, transitions, writeGates };
}

function parseMaxIterations(value: unknown, file: string): number {
  if (value === undefined) return DEFAULT_MAX_ITERATIONS;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new JiePlatformError("INVALID_FIELD_TYPE", {
      detail: `${file}: field 'lifecycle.max_iterations' must be an integer`,
    });
  }
  if (value < 1) {
    throw new JiePlatformError("INVALID_LIFECYCLE", {
      detail: `${file}: lifecycle.max_iterations must be at least 1`,
    });
  }
  return value;
}

function parseTransitions(value: unknown, roleStems: ReadonlySet<string>, file: string): TaskTransitionRule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new JiePlatformError("INVALID_FIELD_TYPE", {
      detail: `${file}: field 'lifecycle.transitions' must be a list`,
    });
  }
  const rules: TaskTransitionRule[] = [];
  const seen = new Map<string, Set<string> | "any">();
  for (let index = 0; index < value.length; index += 1) {
    const name = `lifecycle.transitions[${index}]`;
    const row = asMapping(value[index], name, file);
    const topic = requiredString(row, "topic", name, file);
    const role = requiredString(row, "role", name, file);
    const toPhase = requiredString(row, "phase", name, file);
    if (topic === "") {
      throw new JiePlatformError("INVALID_LIFECYCLE", { detail: `${file}: ${name}.topic must not be empty` });
    }
    if (toPhase === "") {
      throw new JiePlatformError("INVALID_LIFECYCLE", { detail: `${file}: ${name}.phase must not be empty` });
    }
    const fromPhases = parseFromPhases(row.from, name, file);
    if (role !== "any" && !roleStems.has(role)) {
      throw new JiePlatformError("INVALID_LIFECYCLE", { detail: `${file}: ${name} references unknown role '${role}'` });
    }
    const pair = `${topic}\u0000${role}`;
    const previous = seen.get(pair);
    if (fromPhases === "any") {
      if (previous !== undefined) {
        throw new JiePlatformError("INVALID_LIFECYCLE", { detail: `${file}: ${name} duplicates an earlier transition` });
      }
      seen.set(pair, "any");
    } else {
      if (previous === "any") {
        throw new JiePlatformError("INVALID_LIFECYCLE", { detail: `${file}: ${name} duplicates an earlier transition` });
      }
      const phases = previous ?? new Set<string>();
      for (const phase of fromPhases) {
        if (phases.has(phase)) {
          throw new JiePlatformError("INVALID_LIFECYCLE", { detail: `${file}: ${name} duplicates an earlier transition` });
        }
        phases.add(phase);
      }
      seen.set(pair, phases);
    }
    rules.push({ topic, role, fromPhases, toPhase, iteration: parseIterationFlag(row.iteration, name, file) });
  }
  return rules;
}

function parseFromPhases(value: unknown, name: string, file: string): ReadonlyArray<string> | "any" {
  if (value === undefined) {
    throw new JiePlatformError("MISSING_REQUIRED_FIELD", { detail: `missing required field 'from' in ${name} (${file})` });
  }
  if (value === "any") return "any";
  if (typeof value === "string") {
    if (value === "") {
      throw new JiePlatformError("INVALID_LIFECYCLE", { detail: `${file}: ${name}.from must not be empty` });
    }
    return [value];
  }
  const phases = asStringList(value, `${name}.from`, file);
  if (phases.length === 0) {
    throw new JiePlatformError("INVALID_LIFECYCLE", { detail: `${file}: ${name}.from must not be empty` });
  }
  if (phases.some((phase) => phase === "")) {
    throw new JiePlatformError("INVALID_LIFECYCLE", { detail: `${file}: ${name}.from must not contain empty phases` });
  }
  return phases;
}

function parseIterationFlag(value: unknown, name: string, file: string): "reset" | "increment" | null {
  if (value === undefined) return null;
  if (value !== "reset" && value !== "increment") {
    throw new JiePlatformError("INVALID_FIELD_TYPE", {
      detail: `${file}: field '${name}.iteration' must be 'reset' or 'increment'`,
    });
  }
  return value;
}

function parseWriteGates(value: unknown, roleStems: ReadonlySet<string>, file: string): WriteGateRule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new JiePlatformError("INVALID_FIELD_TYPE", {
      detail: `${file}: field 'lifecycle.write_gates' must be a list`,
    });
  }
  const gates: WriteGateRule[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const name = `lifecycle.write_gates[${index}]`;
    const row = asMapping(value[index], name, file);
    const pattern = requiredString(row, "pattern", name, file);
    if (pattern === "") {
      throw new JiePlatformError("INVALID_LIFECYCLE", { detail: `${file}: ${name}.pattern must not be empty` });
    }
    if (!("roles" in row) || row.roles === undefined) {
      throw new JiePlatformError("MISSING_REQUIRED_FIELD", { detail: `missing required field 'roles' in ${name} (${file})` });
    }
    const roles = asStringList(row.roles, `${name}.roles`, file);
    for (const role of roles) {
      if (role !== "any" && !roleStems.has(role)) {
        throw new JiePlatformError("INVALID_LIFECYCLE", { detail: `${file}: ${name} references unknown role '${role}'` });
      }
    }
    gates.push({ pattern, roles });
  }
  return gates;
}

function requiredString(row: Record<string, unknown>, field: string, name: string, file: string): string {
  if (!(field in row) || row[field] === undefined) {
    throw new JiePlatformError("MISSING_REQUIRED_FIELD", { detail: `missing required field '${field}' in ${name} (${file})` });
  }
  return asString(row[field], `${name}.${field}`, file);
}

function asMapping(value: unknown, name: string, file: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new JiePlatformError("INVALID_FIELD_TYPE", { detail: `${file}: field '${name}' must be a mapping` });
  }
  return value as Record<string, unknown>;
}

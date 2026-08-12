import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { JiePlatformError } from "../jie-platform-errors";
import { isValidAgentId, parseAgentManifest } from "./parser";
import type { AgentSoul } from "./types";

export interface AgentRegistry {
  resolve(agentId: string): AgentSoul;
  listInstalled(): ReadonlyArray<string>;
  locate(agentId: string): "project" | "user" | null;
}

export class AgentRegistryImpl implements AgentRegistry {
  private readonly userAgentsDir: string;

  constructor(
    homeJieDir: string,
    private readonly projectJieDir: string | null,
  ) {
    this.userAgentsDir = join(homeJieDir, "agents");
  }

  resolve(agentId: string): AgentSoul {
    if (!isValidAgentId(agentId)) {
      throw new JiePlatformError("INVALID_AGENT_REF", { detail: `invalid agent id: ${agentId}` });
    }
    const path = this.resolvePath(agentId);
    if (path === null) {
      throw new JiePlatformError("AGENT_NOT_FOUND", { detail: `agent '${agentId}' not found` });
    }
    const content = readFileSync(path, "utf-8");
    return parseAgentManifest(agentId, content, path);
  }

  listInstalled(): string[] {
    const ids = new Set<string>();
    for (const dir of [this.projectAgentsDir(), this.userAgentsDir]) {
      if (dir === null) continue;
      const entries = this.readAgentEntries(dir);
      for (const entry of entries) ids.add(entry);
    }
    return [...ids].sort();
  }

  locate(agentId: string): "project" | "user" | null {
    if (this.projectAgentPath(agentId) !== null) return "project";
    if (this.userAgentPath(agentId) !== null) return "user";
    return null;
  }

  private resolvePath(agentId: string): string | null {
    return this.projectAgentPath(agentId) ?? this.userAgentPath(agentId);
  }

  private projectAgentPath(agentId: string): string | null {
    const dir = this.projectAgentsDir();
    if (dir === null) return null;
    const path = join(dir, `${agentId}.md`);
    return existsSync(path) ? path : null;
  }

  private userAgentPath(agentId: string): string | null {
    const path = join(this.userAgentsDir, `${agentId}.md`);
    return existsSync(path) ? path : null;
  }

  private projectAgentsDir(): string | null {
    return this.projectJieDir === null ? null : join(this.projectJieDir, "agents");
  }

  private readAgentEntries(dir: string): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return [];
    }
    const ids: string[] = [];
    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      if (!entry.endsWith(".md")) continue;
      const fullPath = join(dir, entry);
      if (!statSync(fullPath).isFile()) continue;
      const stem = entry.slice(0, -3);
      if (!isValidAgentId(stem)) continue;
      ids.push(stem);
    }
    return ids;
  }
}

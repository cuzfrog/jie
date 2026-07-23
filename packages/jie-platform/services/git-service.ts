export interface GitSnapshot {
  readonly branch: string;
  readonly dirty: boolean;
  readonly ahead: number;
  readonly behind: number;
}

export interface GitService {
  getSnapshot(): GitSnapshot;
}

const DEFAULT_MIN_INTERVAL_MS = 5000;

export class GitServiceImpl implements GitService {
  private lastRefreshedAt = -Infinity;
  private cached: GitSnapshot = { branch: "", dirty: false, ahead: 0, behind: 0 };

  constructor(
    private readonly cwd: string,
    private readonly readGitStatus: (cwd: string) => GitSnapshot = readGitStatusViaSpawn,
    private readonly minIntervalMs: number = DEFAULT_MIN_INTERVAL_MS,
    private readonly now: () => number = Date.now,
  ) {}

  getSnapshot(): GitSnapshot {
    const t = this.now();
    if (t - this.lastRefreshedAt >= this.minIntervalMs) {
      this.lastRefreshedAt = t;
      this.cached = this.readGitStatus(this.cwd);
    }
    return this.cached;
  }
}

function readGitStatusViaSpawn(cwd: string): GitSnapshot {
  let branch = "";
  try {
    const branchProcess = Bun.spawnSync({ cmd: ["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], stdout: "pipe", stderr: "pipe" });
    if (branchProcess.exitCode === 0) {
      branch = new TextDecoder().decode(branchProcess.stdout).trim();
    }
  } catch {
    branch = "";
  }
  const dirty = isDirty(cwd);
  const { ahead, behind } = aheadBehind(cwd);
  return { branch, dirty, ahead, behind };
}

function isDirty(cwd: string): boolean {
  try {
    const proc = Bun.spawnSync({ cmd: ["git", "-C", cwd, "status", "--porcelain"], stdout: "pipe", stderr: "pipe" });
    if (proc.exitCode !== 0) return false;
    return new TextDecoder().decode(proc.stdout).trim() !== "";
  } catch {
    return false;
  }
}

function aheadBehind(cwd: string): { readonly ahead: number; readonly behind: number } {
  try {
    const proc = Bun.spawnSync({ cmd: ["git", "-C", cwd, "rev-list", "--left-right", "--count", "HEAD...@{u}"], stdout: "pipe", stderr: "pipe" });
    if (proc.exitCode !== 0) return { ahead: 0, behind: 0 };
    const decoded = new TextDecoder().decode(proc.stdout).trim();
    if (decoded === "") return { ahead: 0, behind: 0 };
    const [aheadRaw, behindRaw] = decoded.split(/\s+/);
    return { ahead: Number.parseInt(aheadRaw ?? "0", 10) || 0, behind: Number.parseInt(behindRaw ?? "0", 10) || 0 };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

import { type Command, type CommandExecutor, type CommandName, type CommandResult } from "./command";
import type { Settings, SettingsStore } from "./config";
import { type EventEnvelope, type EventManager, type EventType, Events } from "./event";
import type { TeamManager } from "./team";
import type { TeamInfo } from "./types";

export interface JiePlatformOptions {
  readonly cwd: string;
  readonly homeJieDir: string;
  readonly projectJieDir: string | null;
  readonly resumeSessionId?: string;
  readonly inMemory?: boolean;
}

export interface JiePlatform {
  readonly settings: Settings;

  prompt(teamId: string, agentKey: string, text: string): void;
  interrupt(teamId: string, agentKey: string): void;

  subscribe<T extends EventType>(topic: T, callback: (event: EventEnvelope<T>) => void): () => void;
  execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>>;
  teams(): ReadonlyArray<TeamInfo>;
}

export class JiePlatformImpl implements JiePlatform {
  readonly settings: Settings;

  constructor(
    settingsStore: SettingsStore,
    private readonly eventManager: EventManager,
    private readonly commandExecutor: CommandExecutor,
    private readonly teamManager: TeamManager,
  ) {
    this.settings = settingsStore.load();
  }

  prompt(teamId: string, agentKey: string, text: string): void {
    this.eventManager.publish(Events.userPrompt({ kind: "user" }, teamId, text, agentKey));
  }

  interrupt(teamId: string, agentKey: string): void {
    this.eventManager.publish(Events.agentInterrupt({ kind: "user" }, teamId, agentKey));
  }

  subscribe<T extends EventType>(topic: T, callback: (event: EventEnvelope<T>) => void): () => void {
    return this.eventManager.subscribe(topic, callback);
  }

  execute<T extends CommandName>(command: Command<T>): Promise<CommandResult<T>> {
    return this.commandExecutor.execute(command);
  }

  teams(): ReadonlyArray<TeamInfo> {
    return [...this.teamManager.listLoaded().values()];
  }
}

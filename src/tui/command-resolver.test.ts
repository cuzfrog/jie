import type { JiePlatform } from "../platform";
import { CommandResolverImpl, type ResolvedCommand } from "./command-resolver";
import { makeTuiState } from "./test";
import { makeAgentUiState } from "./test";

function makeFakePlatform(execute: JiePlatform["execute"] = async () => null): JiePlatform {
  return {
    settings: { defaultTeam: undefined, defaultProvider: undefined, defaultModel: undefined },
    subscribe: () => () => undefined,
    prompt: () => undefined,
    interrupt: () => undefined,
    dequeuePrompt: () => undefined,
    requeuePrompt: () => undefined,
    execute,
    teams: () => [],
    shutdown: () => Promise.resolve(),
  };
}

function withTeam(state = makeTuiState()) {
  const teamId = "t1";
  const agent = makeAgentUiState("t1:general-1");
  return makeTuiState({
    ...state,
    teamId,
    leaderAgentId: "t1:general-1",
    focusedAgentId: "t1:general-1",
    agents: state.agents.size > 0 ? state.agents : new Map([[agent.agentId, agent]]),
  });
}

describe("CommandResolverImpl", () => {
  test("/help resolves to a UI action", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    const result = resolver.resolve(makeTuiState(), "help", []);
    expect(result).toEqual({ kind: "ui", action: "showHelp" });
  });

  test("/clear resolves to a UI clear action", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(makeTuiState(), "clear", [])).toEqual({ kind: "ui", action: "clearState" });
    expect(resolver.resolve(makeTuiState(), "new", [])).toEqual({ kind: "ui", action: "clearState" });
  });

  test("/exit resolves to a UI stop action", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(makeTuiState(), "exit", [])).toEqual({ kind: "ui", action: "stop" });
  });

  test("unknown command returns an error", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    const result = resolver.resolve(makeTuiState(), "nope", []);
    expect(result).toEqual({ kind: "error", text: "unknown slash command: /nope" });
  });

  test("/login requires two arguments", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(makeTuiState(), "login", ["anthropic"])).toEqual({
      kind: "error",
      text: "/login <provider> <apiKey>",
    });
  });

  test("/login builds the login platform command", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    const result = resolver.resolve(makeTuiState(), "login", ["anthropic", "sk-x"]);
    expect(result).toEqual({
      kind: "platform",
      slashName: "login",
      command: { name: "login", provider: "anthropic", apiKey: "sk-x" },
      transient: "logged in to anthropic",
    });
  });

  test("/logout builds the logout platform command", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(makeTuiState(), "logout", ["anthropic"])).toEqual({
      kind: "platform",
      slashName: "logout",
      command: { name: "logout", provider: "anthropic" },
      transient: "logged out of anthropic",
    });
    expect(resolver.resolve(makeTuiState(), "logout", ["*"])).toEqual({
      kind: "platform",
      slashName: "logout",
      command: { name: "logout", provider: "*" },
      transient: "logged out of all providers",
    });
  });

  test("/model requires a provider/modelId pair", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(makeTuiState(), "model", ["claude"])).toEqual({
      kind: "error",
      text: "/model: invalid 'claude' (expected <provider>/<modelId>)",
    });
  });

  test("/model builds the setDefaultModel command", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(makeTuiState(), "model", ["anthropic/claude-sonnet-4-5"])).toEqual({
      kind: "platform",
      slashName: "model",
      command: { name: "setDefaultModel", provider: "anthropic", id: "claude-sonnet-4-5" },
      transient: "default model set to anthropic/claude-sonnet-4-5",
    });
  });

  test("/model rejects a missing slash", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    const result = resolver.resolve(makeTuiState(), "model", ["claude"]) as Extract<ResolvedCommand, { kind: "error" }>;
    expect(result.kind).toBe("error");
  });

  test("/team requires a team id", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(makeTuiState(), "team", [])).toEqual({ kind: "error", text: "/team <teamId>" });
  });

  test("/team builds a team load command", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(makeTuiState(), "team", ["alpha"])).toEqual({
      kind: "platform",
      slashName: "team",
      command: { name: "team", teamId: "alpha" },
      transient: "loading team 'alpha'",
    });
  });

  test("/resume requires a session id and a loaded team", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(makeTuiState(), "resume", ["sess-1"])).toEqual({
      kind: "error",
      text: "/resume: no team loaded",
    });
  });

  test("/resume builds a resume session command", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    const result = resolver.resolve(withTeam(), "resume", ["sess-1"]);
    expect(result).toEqual({
      kind: "platform",
      slashName: "resume",
      command: { name: "resumeSession", teamId: "t1", sessionId: "sess-1" },
      transient: "resuming session 'sess-1'",
    });
  });

  test("/rename requires a name and a loaded team", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(makeTuiState(), "rename", ["new name"])).toEqual({
      kind: "error",
      text: "/rename: no team loaded",
    });
  });

  test("/rename builds a rename session command", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    const result = resolver.resolve(withTeam(), "rename", ["new name"]);
    expect(result).toEqual({
      kind: "platform",
      slashName: "rename",
      command: { name: "renameSession", teamId: "t1", sessionName: "new name" },
      transient: "session renamed to new name",
    });
  });

  test("/compact requires a focused, idle agent", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    const busy = withTeam(makeTuiState({
      agents: new Map([["t1:general-1", makeAgentUiState("t1:general-1", { status: "busy" })]]),
    }));
    expect(resolver.resolve(busy, "compact", [])).toEqual({
      kind: "error",
      text: "wait for the current response to finish before compacting",
    });
    const noTeam = makeTuiState();
    expect(resolver.resolve(noTeam, "compact", [])).toEqual({ kind: "error", text: "/compact: no focused agent" });
  });

  test("/compact builds the compact command", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    const result = resolver.resolve(withTeam(), "compact", []);
    expect(result).toEqual({
      kind: "platform",
      slashName: "compact",
      command: { name: "compact", teamId: "t1", agentKey: "general-1" },
      transient: "compacting conversation...",
    });
  });

  test("/reload rejects while any agent is busy", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    const busy = withTeam(makeTuiState({
      agents: new Map([["t1:general-1", makeAgentUiState("t1:general-1", { status: "busy" })]]),
    }));
    expect(resolver.resolve(busy, "reload", [])).toEqual({
      kind: "error",
      text: "wait for the current response to finish before reloading",
    });
  });

  test("/reload builds the reload command", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(withTeam(), "reload", [])).toEqual({
      kind: "platform",
      slashName: "reload",
      command: { name: "reload" },
      transient: "reloaded settings, manifests, and context files",
    });
  });

  test("/kanban with no subcommand toggles the kanban view", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(withTeam(), "kanban", [])).toEqual({ kind: "ui", action: "cycleKanbanView" });
  });

  test("/kanban add parses flags and builds the kanbanAdd command", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    const result = resolver.resolve(withTeam(), "kanban", ["add", "--title", "title", "do the thing"]);
    expect(result).toEqual({
      kind: "platform",
      slashName: "kanban add",
      command: { name: "kanbanAdd", teamId: "t1", title: "title", description: "do the thing" },
    });
  });

  test("/kanban add with --ephemeral sets the session scope", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    const result = resolver.resolve(withTeam(), "kanban", ["add", "--ephemeral", "task"]);
    expect(result).toEqual({
      kind: "platform",
      slashName: "kanban add",
      command: { name: "kanbanAdd", teamId: "t1", description: "task", scope: "session" },
    });
  });

  test("/kanban remove/complete/review require a card id", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(withTeam(), "kanban", ["remove"])).toEqual({
      kind: "error",
      text: "/kanban remove <cardId>",
    });
  });

  test("/kanban remove/complete build the kanbanSetStatus or kanbanRemove command", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(withTeam(), "kanban", ["remove", "#1"])).toEqual({
      kind: "platform",
      slashName: "kanban remove",
      command: { name: "kanbanRemove", teamId: "t1", cardId: "#1" },
    });
    expect(resolver.resolve(withTeam(), "kanban", ["complete", "#1"])).toEqual({
      kind: "platform",
      slashName: "kanban complete",
      command: { name: "kanbanSetStatus", teamId: "t1", cardId: "#1", status: "completed" },
    });
    expect(resolver.resolve(withTeam(), "kanban", ["review", "#1"])).toEqual({
      kind: "platform",
      slashName: "kanban review",
      command: { name: "kanbanSetStatus", teamId: "t1", cardId: "#1", status: "in_review" },
    });
  });

  test("/kanban handoff requires a card id and target team id", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(withTeam(), "kanban", ["handoff", "#1"])).toEqual({
      kind: "error",
      text: "/kanban handoff [<teamId>/]<cardId> <targetTeamId>",
    });
  });

  test("/kanban handoff builds the kanbanHandoff command", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(withTeam(), "kanban", ["handoff", "#1", "other-team"])).toEqual({
      kind: "platform",
      slashName: "kanban handoff",
      command: { name: "kanbanHandoff", teamId: "t1", cardId: "#1", targetTeamId: "other-team" },
    });
  });

  test("/notification sound toggles the sound setting", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    expect(resolver.resolve(makeTuiState(), "notification", ["sound", "enable"])).toEqual({
      kind: "platform",
      slashName: "notification sound",
      command: { name: "setNotificationSoundEnabled", enabled: true },
      transient: "sound notifications enabled",
    });
    expect(resolver.resolve(makeTuiState(), "notification", ["sound", "disable"])).toEqual({
      kind: "platform",
      slashName: "notification sound",
      command: { name: "setNotificationSoundEnabled", enabled: false },
      transient: "sound notifications disabled",
    });
  });

  test("/model-filter list queries the platform and returns a reply", async () => {
    const resolver = new CommandResolverImpl(makeFakePlatform(async (command) => {
      if (command.name === "getModelFilters") return ["qwen", "anthropic"];
      return null;
    }));
    const result = await resolver.resolve(makeTuiState(), "model-filter", ["list"]);
    expect(result).toEqual({ kind: "reply", text: "model filters: qwen · anthropic" });
  });

  test("/model-filter list reports no filters", async () => {
    const resolver = new CommandResolverImpl(makeFakePlatform(async (command) => {
      if (command.name === "getModelFilters") return [];
      return null;
    }));
    const result = await resolver.resolve(makeTuiState(), "model-filter", ["list"]);
    expect(result).toEqual({ kind: "reply", text: "no model filters set" });
  });

  test("/model-filter add validates against available models", async () => {
    const resolver = new CommandResolverImpl(makeFakePlatform(async (command) => {
      if (command.name === "getModelFilters") return [];
      if (command.name === "listModels") {
        return [{ provider: "anthropic", id: "claude-sonnet-4-5", available: true }];
      }
      return null;
    }));
    const result = await resolver.resolve(makeTuiState(), "model-filter", ["add", "claude"]);
    expect(result).toEqual({
      kind: "platform",
      slashName: "model-filter",
      command: { name: "setModelFilters", filters: ["claude"] },
      transient: "model filter added: claude",
    });
  });

  test("/model-filter add rejects patterns that exclude all available models", async () => {
    const resolver = new CommandResolverImpl(makeFakePlatform(async (command) => {
      if (command.name === "getModelFilters") return [];
      if (command.name === "listModels") {
        return [{ provider: "anthropic", id: "claude-sonnet-4-5", available: true }];
      }
      return null;
    }));
    const result = await resolver.resolve(makeTuiState(), "model-filter", ["add", "qwen"]);
    expect(result).toEqual({
      kind: "error",
      text: "/model-filter: pattern 'qwen' rejected — it matches none of the 1 available models",
    });
  });

  test("/model-filter remove requires an existing filter", async () => {
    const resolver = new CommandResolverImpl(makeFakePlatform(async (command) => {
      if (command.name === "getModelFilters") return ["anthropic"];
      return null;
    }));
    const result = await resolver.resolve(makeTuiState(), "model-filter", ["remove", "qwen"]);
    expect(result).toEqual({
      kind: "error",
      text: "/model-filter: pattern 'qwen' is not set",
    });
  });

  test("/effort sets the default effort level", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    const result = resolver.resolve(makeTuiState(), "effort", ["medium"]);
    expect(result).toEqual({
      kind: "platform",
      slashName: "effort",
      command: { name: "setDefaultEffort", effort: "medium" },
      transient: "effort set to medium",
    });
  });

  test("/effort rejects invalid effort levels", () => {
    const resolver = new CommandResolverImpl(makeFakePlatform());
    const result = resolver.resolve(makeTuiState(), "effort", ["extreme"]);
    expect(result).toEqual({
      kind: "error",
      text: "/effort: invalid 'extreme' (expected off | low | medium | high | max)",
    });
  });

  test("/effort without an argument queries the current default", async () => {
    const resolver = new CommandResolverImpl(makeFakePlatform(async (command) => {
      if (command.name === "getDefaultEffort") return "low";
      return null;
    }));
    const result = await resolver.resolve(makeTuiState(), "effort", []);
    expect(result).toEqual({ kind: "reply", text: "default effort: low" });
  });
});

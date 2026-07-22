import { createTui, type Tui } from "../tui";
import { Actions } from "../state";
import { withTTY } from "../../../tests/support";
import {
  Events,
  type JiePlatform,
  type EventType,
  type AnyEventEnvelope,
  type EventEnvelope,
  type TeamInfo,
} from "@cuzfrog/jie-platform";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;
declare const beforeEach: (fn: () => void) => void;

interface PromptCall {
  readonly teamId: string;
  readonly agentKey: string;
  readonly text: string;
}

interface TestPlatform {
  readonly platform: JiePlatform;
  readonly prompts: PromptCall[];
  readonly handlers: Map<EventType, (env: AnyEventEnvelope) => void>;
}

function makePlatform(): TestPlatform {
  const handlers = new Map<EventType, (env: AnyEventEnvelope) => void>();
  const prompts: PromptCall[] = [];
  const platform: JiePlatform = {
    settings: { defaultTeam: undefined, defaultProvider: undefined, defaultModel: undefined },
    subscribe: <T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void) => {
      const handler = cb as (env: AnyEventEnvelope) => void;
      handlers.set(topic, handler);
      return () => {
        if (handlers.get(topic) === handler) handlers.delete(topic);
      };
    },
    prompt: (teamId: string, agentKey: string, text: string) => {
      prompts.push({ teamId, agentKey, text });
    },
    interrupt: () => undefined,
    execute: (async () => null) as JiePlatform["execute"],
    teams: () => [],
  };
  return { platform, prompts, handlers };
}

function makeTeamInfo(): TeamInfo {
  return {
    id: "team-1",
    leaderKey: "agent-1",
    history: [],
    agents: [
      { teamId: "team-1", role: "general", agentKey: "agent-1", isLeader: true, model: null },
    ],
  };
}

function emitTeamLoaded(platform: TestPlatform, info: TeamInfo): void {
  const handler = platform.handlers.get("system.team.loaded");
  if (handler === undefined) throw new Error("no handler subscribed for system.team.loaded");
  handler(Events.teamLoaded({ kind: "system" }, info));
}

interface TuiInternal {
  readonly stateStore: { dispatch: (a: unknown) => void; getState: () => { focusedAgentId: string | null; errorBanner: string | null } };
}
function internals(tui: Tui): TuiInternal {
  return tui as unknown as TuiInternal;
}

describe("handleSubmitEditorText — ! bash mode routing", () => {
  beforeEach(() => {
    withTTY(true, () => undefined);
  });

  test("!cmd dispatches a bash directive to the focused agent via platform.prompt", () => {
    withTTY(true, () => {
      const tp = makePlatform();
      const tui: Tui = createTui({ cwd: process.cwd() }, { platform: tp.platform });
      try {
        emitTeamLoaded(tp, makeTeamInfo());
        internals(tui).stateStore.dispatch(Actions.submitEditorText("!ls -la"));
        expect(tp.prompts.length).toBe(1);
        const call = tp.prompts[0]!;
        expect(call.teamId).toBe("team-1");
        expect(call.agentKey).toBe("agent-1");
        expect(call.text).toContain("ls -la");
        expect(call.text).toContain("bash tool");
      } finally {
        tui.stop();
      }
    });
  });

  test("!!cmd dispatches a directive that asks the agent to exclude the output from context", () => {
    withTTY(true, () => {
      const tp = makePlatform();
      const tui: Tui = createTui({ cwd: process.cwd() }, { platform: tp.platform });
      try {
        emitTeamLoaded(tp, makeTeamInfo());
        internals(tui).stateStore.dispatch(Actions.submitEditorText("!!cat secret"));
        expect(tp.prompts.length).toBe(1);
        const text = tp.prompts[0]!.text.toLowerCase();
        expect(text).toContain("cat secret");
        expect(text).toContain("not include");
      } finally {
        tui.stop();
      }
    });
  });

  test("plain text (without !) is forwarded verbatim, not wrapped in a bash directive", () => {
    withTTY(true, () => {
      const tp = makePlatform();
      const tui: Tui = createTui({ cwd: process.cwd() }, { platform: tp.platform });
      try {
        emitTeamLoaded(tp, makeTeamInfo());
        internals(tui).stateStore.dispatch(Actions.submitEditorText("hello world"));
        expect(tp.prompts.length).toBe(1);
        expect(tp.prompts[0]!.text).toBe("hello world");
      } finally {
        tui.stop();
      }
    });
  });

  test("bare ! does not call platform.prompt and surfaces a missing-command error banner", () => {
    withTTY(true, () => {
      const tp = makePlatform();
      const tui: Tui = createTui({ cwd: process.cwd() }, { platform: tp.platform });
      try {
        emitTeamLoaded(tp, makeTeamInfo());
        internals(tui).stateStore.dispatch(Actions.submitEditorText("!"));
        expect(tp.prompts.length).toBe(0);
        expect(internals(tui).stateStore.getState().errorBanner).toMatch(/bash mode requires a command/);
      } finally {
        tui.stop();
      }
    });
  });

  test("!cmd with no team loaded surfaces an error banner and does not call platform.prompt", () => {
    withTTY(true, () => {
      const tp = makePlatform();
      const tui: Tui = createTui({ cwd: process.cwd() }, { platform: tp.platform });
      try {
        internals(tui).stateStore.dispatch(Actions.submitEditorText("!ls"));
        expect(tp.prompts.length).toBe(0);
        expect(internals(tui).stateStore.getState().errorBanner).toMatch(/no team loaded/i);
      } finally {
        tui.stop();
      }
    });
  });

  test("/help still routes to the slash command handler instead of bash mode", () => {
    withTTY(true, () => {
      const tp = makePlatform();
      const tui: Tui = createTui({ cwd: process.cwd() }, { platform: tp.platform });
      try {
        emitTeamLoaded(tp, makeTeamInfo());
        internals(tui).stateStore.dispatch(Actions.submitEditorText("/help"));
        expect(tp.prompts.length).toBe(0);
        const state = internals(tui).stateStore.getState();
        expect(state.errorBanner === null || state.errorBanner === "" || /type a prompt/.test(state.errorBanner ?? "")).toBe(true);
      } finally {
        tui.stop();
      }
    });
  });
});

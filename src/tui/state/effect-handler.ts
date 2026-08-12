import type { StopReason } from "@earendil-works/pi-ai";
import type { Terminal } from "@earendil-works/pi-tui";
import { type AnyEventEnvelope, type JiePlatform } from "../../platform";
import { logger } from "../../utils";
import type { CommandHandler } from "../command";
import { Actions, ActionTypes } from "./actions";
import type { KanbanEditField } from "./state";
import type { StateStore } from "./state-store";

const log = logger.getSubLogger({ name: "jie.tui.effect-handler" });

export interface EffectHandler {
  dispose(): void;
}

export class EffectHandlerImpl implements EffectHandler {
  private readonly platform: JiePlatform;
  private readonly stateStore: StateStore;
  private readonly terminal: Terminal;
  private readonly unsubscribeBus: () => void;
  private readonly unsubscribeActions: () => void;

  constructor(
    platform: JiePlatform,
    stateStore: StateStore,
    commandHandler: CommandHandler,
    terminal: Terminal,
    quitTui: () => Promise<void>,
  ) {
    this.platform = platform;
    this.stateStore = stateStore;
    this.terminal = terminal;
    this.unsubscribeBus = subscribeToBus(platform, (env) => {
      this.stateStore.dispatch(Actions.receiveEvent(env));
      if (env.type === "agent.idle") {
        void this.maybePlaySound(env);
      }
    });
    this.unsubscribeActions = stateStore.subscribe(async (action, afterState) => {
      switch (action.type) {
        case ActionTypes.SUBMIT_EDITOR_TEXT:
          commandHandler.handle(action.payload.text);
          return;
        case ActionTypes.REQUEST_INTERRUPT:
          this.platform.interrupt(action.payload.teamId, action.payload.agentKey);
          return;
        case ActionTypes.REQUEST_DEQUEUE:
          this.platform.dequeuePrompt(action.payload.teamId, action.payload.agentKey, action.payload.prompt);
          return;
        case ActionTypes.REQUEST_REQUEUE:
          this.platform.requeuePrompt(action.payload.teamId, action.payload.agentKey, action.payload.prompt);
          return;
        case ActionTypes.REQUEST_QUIT:
          await quitTui();
          return;
        case ActionTypes.SAVE_KANBAN_EDIT:
          this.persistKanbanEdit(afterState.teamId, action.payload.cardId, action.payload.field, action.payload.text);
          return;
        default:
          return;
      }
    });
  }

  dispose(): void {
    this.unsubscribeBus();
    this.unsubscribeActions();
  }

  private persistKanbanEdit(teamId: string | null, cardId: string, field: KanbanEditField, text: string): void {
    if (teamId === null) return;
    void this.platform.execute({ name: "kanbanEdit", teamId, cardId, field, text })
      .then((result) => {
        this.stateStore.dispatch(Actions.setKanbanBoard(result.board));
      }, (error: unknown) => {
        this.stateStore.dispatch(Actions.setErrorMessage(`kanban edit failed: ${error instanceof Error ? error.message : String(error)}`));
      });
  }

  private async maybePlaySound(env: AnyEventEnvelope): Promise<void> {
    if (env.type !== "agent.idle" || env.sender.kind !== "agent") return;
    const state = this.stateStore.getState();
    const activeId = state.focusedAgentId ?? state.leaderAgentId;
    if (activeId === null) return;
    if (`${env.sender.teamId}:${env.sender.agentKey}` !== activeId) return;
    if (!_shouldRingOnIdle(env.payload)) return;
    try {
      const enabled = await this.platform.execute({ name: "getNotificationSoundEnabled" });
      if (enabled) this.terminal.write("\x07");
    } catch (error: unknown) {
      log.error(`failed to read notification sound setting: ${String(error)}`);
    }
  }
}

function subscribeToBus(platform: JiePlatform, onEvent: (event: AnyEventEnvelope) => void): () => void {
  const unsubscribes: Array<() => void> = [
    platform.subscribe("system.team.loaded", onEvent),
    platform.subscribe("system.error", onEvent),
    platform.subscribe("agent.model.assigned", onEvent),
    platform.subscribe("agent.prompt.queue.update", onEvent),
    platform.subscribe("agent.turn.start", onEvent),
    platform.subscribe("agent.turn.continue", onEvent),
    platform.subscribe("agent.idle", onEvent),
    platform.subscribe("agent.stream.chunk", onEvent),
    platform.subscribe("agent.stream.end", onEvent),
    platform.subscribe("agent.tool.call", onEvent),
    platform.subscribe("agent.tool.result", onEvent),
    platform.subscribe("agent.usage", onEvent),
    platform.subscribe("agent.compacted", onEvent),
    platform.subscribe("agent.compaction.start", onEvent),
    platform.subscribe("agent.compaction.end", onEvent),
  ];
  let unsubscribed = false;
  return (): void => {
    if (unsubscribed) return;
    unsubscribed = true;
    for (const unsub of unsubscribes) unsub();
  };
}

function _shouldRingOnIdle(reason: StopReason): boolean {
  return reason === "stop" || reason === "error" || reason === "length";
}

export { _shouldRingOnIdle };

import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { ModelControllerImpl, type ModelController } from "./model-controller";
import type { AgentSender, EventEnvelope, EventManager, EventType } from "../event";
import type { EffortLevel } from "../types";

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(() => () => {}),
});

const sender: AgentSender = { kind: "agent", teamId: "t1", agentKey: "general-1" };

let model: Model<Api>;
let thinkingLevel: ThinkingLevel;

const agentState = {
  setModel: (next: Model<Api>) => {
    model = next;
  },
  getThinkingLevel: (): ThinkingLevel => thinkingLevel,
  setThinkingLevel: (level: ThinkingLevel) => {
    thinkingLevel = level;
  },
};

const resolveModel = vi.fn((_provider: string, _modelId: string): Model<Api> | undefined => undefined);

function makeController(initialModel: Model<Api> | undefined, effort: EffortLevel, soulPinsModel = false, soulPinsEffort = false): ModelController {
  return new ModelControllerImpl(initialModel, effort, { eventManager, sender, soulPinsModel, soulPinsEffort, resolveModel, agentState });
}

function makeModel(provider: string, id: string): Model<Api> {
  return {
    id,
    name: id,
    api: "anthropic-messages" as Api,
    provider,
    baseUrl: "",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192,
  };
}

function envelopes<T extends EventType>(topic: T): EventEnvelope<T>[] {
  return eventManager.publish.mock.calls
    .map((call) => call[0])
    .filter((env): env is EventEnvelope<T> => env.topic === topic);
}

beforeEach(() => {
  model = makeModel("anthropic", "claude-sonnet-4");
  thinkingLevel = "off";
});

describe("ModelController — initial assignment", () => {
  test("sets the thinkingLevel from the effort param, assigns the model, and publishes agent.model.assigned", () => {
    const initial = makeModel("anthropic", "claude-sonnet-4");
    const controller = makeController(initial, "high");
    expect(thinkingLevel).toBe("high");
    expect(model).toBe(initial);
    const assigned = envelopes("agent.model.assigned");
    expect(assigned).toHaveLength(1);
    expect(assigned[0]!.payload).toEqual({ provider: "anthropic", model: "claude-sonnet-4", effort: "high", contextWindow: 200000 });
    expect(controller.modelInfo).toEqual({ provider: "anthropic", id: "claude-sonnet-4", effort: "high", contextWindow: 200000 });
  });

  test("publishes with effort 'off' when the effort param is 'off'", () => {
    makeController(makeModel("anthropic", "claude-sonnet-4"), "off");
    expect(thinkingLevel).toBe("off");
    expect(envelopes("agent.model.assigned")[0]!.payload.effort).toBe("off");
  });

  test("maps effort 'max' to the 'xhigh' thinkingLevel while reporting 'max' effort", () => {
    makeController(makeModel("anthropic", "claude-sonnet-4"), "max");
    expect(thinkingLevel).toBe("xhigh");
    expect(envelopes("agent.model.assigned")[0]!.payload.effort).toBe("max");
  });

  test("without a model sets the thinkingLevel, publishes nothing, and reports null modelInfo", () => {
    const controller = makeController(undefined, "low");
    expect(thinkingLevel).toBe("low");
    expect(envelopes("agent.model.assigned")).toHaveLength(0);
    expect(controller.modelInfo).toBeNull();
  });
});

describe("ModelController — applyEffort", () => {
  test("updates the thinkingLevel and republishes agent.model.assigned with the new effort", () => {
    const controller = makeController(makeModel("anthropic", "claude-sonnet-4"), "off");
    controller.applyEffort("high");
    expect(thinkingLevel).toBe("high");
    const assigned = envelopes("agent.model.assigned");
    expect(assigned).toHaveLength(2);
    expect(assigned[1]!.payload).toEqual({ provider: "anthropic", model: "claude-sonnet-4", effort: "high", contextWindow: 200000 });
    expect(controller.modelInfo).toEqual({ provider: "anthropic", id: "claude-sonnet-4", effort: "high", contextWindow: 200000 });
  });

  test("maps effort 'max' to the 'xhigh' thinkingLevel while reporting 'max'", () => {
    const controller = makeController(makeModel("anthropic", "claude-sonnet-4"), "off");
    controller.applyEffort("max");
    expect(thinkingLevel).toBe("xhigh");
    expect(envelopes("agent.model.assigned")[1]!.payload.effort).toBe("max");
  });

  test("without a model the thinkingLevel still updates but nothing is republished", () => {
    const controller = makeController(undefined, "off");
    controller.applyEffort("low");
    expect(thinkingLevel).toBe("low");
    expect(envelopes("agent.model.assigned")).toHaveLength(0);
  });

  test("ignores the update when the soul pins effort", () => {
    const controller = makeController(makeModel("anthropic", "claude-sonnet-4"), "off", false, true);
    controller.applyEffort("high");
    expect(thinkingLevel).toBe("off");
    expect(envelopes("agent.model.assigned")).toHaveLength(1);
    expect(controller.modelInfo).toEqual({ provider: "anthropic", id: "claude-sonnet-4", effort: "off", contextWindow: 200000 });
  });
});

describe("ModelController — applyModelUpdate", () => {
  test("swaps the model and publishes agent.model.assigned with the new model", () => {
    const nextModel = makeModel("lm-studio", "qwen3.5-2b");
    resolveModel.mockReturnValueOnce(nextModel);
    const controller = makeController(makeModel("anthropic", "claude-sonnet-4"), "off");
    controller.applyModelUpdate("lm-studio", "qwen3.5-2b");
    expect(resolveModel).toHaveBeenCalledWith("lm-studio", "qwen3.5-2b");
    expect(model).toBe(nextModel);
    const assigned = envelopes("agent.model.assigned");
    expect(assigned).toHaveLength(2);
    expect(assigned[1]!.payload).toEqual({ provider: "lm-studio", model: "qwen3.5-2b", effort: "off", contextWindow: 200000 });
    expect(controller.modelInfo).toEqual({ provider: "lm-studio", id: "qwen3.5-2b", effort: "off", contextWindow: 200000 });
  });

  test("preserves the current effort across the swap", () => {
    resolveModel.mockReturnValueOnce(makeModel("lm-studio", "qwen3.5-2b"));
    const controller = makeController(makeModel("anthropic", "claude-sonnet-4"), "high");
    controller.applyModelUpdate("lm-studio", "qwen3.5-2b");
    expect(envelopes("agent.model.assigned")[1]!.payload.effort).toBe("high");
  });

  test("without prior model info derives the effort from the current thinkingLevel", () => {
    resolveModel.mockReturnValueOnce(makeModel("lm-studio", "qwen3.5-2b"));
    const controller = makeController(undefined, "off");
    thinkingLevel = "high";
    controller.applyModelUpdate("lm-studio", "qwen3.5-2b");
    expect(envelopes("agent.model.assigned")[0]!.payload.effort).toBe("high");
  });

  test("ignores the update when the soul pins a model", () => {
    const pinned = makeModel("anthropic", "claude-sonnet-4");
    const controller = makeController(pinned, "off", true);
    controller.applyModelUpdate("lm-studio", "qwen3.5-2b");
    expect(resolveModel).not.toHaveBeenCalled();
    expect(model).toBe(pinned);
    expect(envelopes("agent.model.assigned")).toHaveLength(1);
  });

  test("ignores an unresolvable model reference", () => {
    const initial = makeModel("anthropic", "claude-sonnet-4");
    const controller = makeController(initial, "off");
    controller.applyModelUpdate("lm-studio", "no-such-model");
    expect(resolveModel).toHaveBeenCalledWith("lm-studio", "no-such-model");
    expect(model).toBe(initial);
    expect(envelopes("agent.model.assigned")).toHaveLength(1);
  });
});

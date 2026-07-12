import { render } from "../../test-renderer";
import { ChatWheelInput } from "./chat-wheel-input";
import { TuiContext } from "../context";
import { Actions, createStateStore, type Action, type AgentUiState, type MessageTurn } from "../../state";
import { makeContextValue } from "../../test-support";

type AgentId = ReturnType<typeof Actions.scrollChat>["payload"]["agentId"];

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

const AGENT_ID: AgentId = "demo:g";
const ESC = String.fromCharCode(0x1b);
const WHEEL_UP = `${ESC}[<64;10;5M`;
const WHEEL_DOWN = `${ESC}[<65;10;5M`;
const CLICK_LEFT = `${ESC}[<0;10;5M`;
const SCROLL_CHAT_TYPE: string = Actions.scrollChat(AGENT_ID, 0).type;
const JUMP_CHAT_TYPE: string = Actions.jumpChat(AGENT_ID, "tail").type;

function turn(text: string): MessageTurn {
  return { userPrompt: text, cards: [], blocks: [{ kind: "text", text }], streamId: null };
}

function agent(turns: ReadonlyArray<MessageTurn>): AgentUiState {
  return {
    agentId: AGENT_ID,
    teamId: "demo",
    agentKey: "g",
    role: "general",
    isLeader: true,
    status: "idle",
    model: null,
    queue: [],
    history: [...turns],
    currentTurn: null,
    lastStopReason: null,
  };
}

interface CapturedDispatch {
  readonly types: string[];
  readonly payloads: unknown[];
}

interface MountedHarness {
  readonly instance: ReturnType<typeof render>;
  readonly out: CapturedDispatch;
  cleanup(): void;
}

function captureContext(): { ctx: ReturnType<typeof makeContextValue>; out: CapturedDispatch; dispatch: (action: Action) => void } {
  const stateStore = createStateStore();
  const types: string[] = [];
  const payloads: unknown[] = [];
  const dispatch = (action: Action): void => {
    types.push(action.type);
    payloads.push(action.payload);
    stateStore.dispatch(action);
  };
  const ctx = makeContextValue({ stateStore, dispatch });
  return { ctx, out: { types, payloads }, dispatch };
}

function mount(
  focused: AgentUiState,
  overrides: { readonly linesPerNotch?: number; readonly tty?: boolean } = {},
): MountedHarness {
  const { ctx, out } = captureContext();
  const instance = render(
    <TuiContext.Provider value={ctx}>
      <ChatWheelInput focused={focused} width={80} height={20} linesPerNotch={overrides.linesPerNotch} />
    </TuiContext.Provider>,
    { stdoutIsTTY: overrides.tty === true },
  );
  return {
    instance,
    out,
    cleanup: () => instance.unmount(),
  };
}

async function mountAsync(
  focused: AgentUiState,
  overrides: { readonly linesPerNotch?: number; readonly tty?: boolean } = {},
): Promise<MountedHarness> {
  const h = mount(focused, overrides);
  await new Promise((r) => setTimeout(r, 30));
  return h;
}

describe("ChatWheelInput", () => {
  test("TTY mount writes SGR enable codes and unmount writes the matching disables", async () => {
    const focused = agent([turn("x")]);
    const h = await mountAsync(focused, { tty: true });
    expect(h.instance.stdout.frames.some((f) => f.includes(`${ESC}[?1000h`))).toBe(true);
    expect(h.instance.stdout.frames.some((f) => f.includes(`${ESC}[?1006h`))).toBe(true);
    h.instance.unmount();
    await new Promise((r) => setTimeout(r, 30));
    const finalFrames = h.instance.stdout.frames;
    expect(finalFrames.some((f) => f.includes(`${ESC}[?1000l`))).toBe(true);
    expect(finalFrames.some((f) => f.includes(`${ESC}[?1006l`))).toBe(true);
  });

  test("wheel-up at tail pin dispatches SCROLL_CHAT with a finite offset", async () => {
    const focused = agent(new Array(60).fill(0).map(() => turn("x")));
    const h = await mountAsync(focused);
    h.instance.stdin.write(WHEEL_UP);
    await new Promise((r) => setTimeout(r, 30));
    expect(h.out.types).toContain(SCROLL_CHAT_TYPE);
    const payload = h.out.payloads.find((p) => (p as { agentId: AgentId }).agentId === AGENT_ID) as
      | { agentId: AgentId; newOffsetRows: number }
      | undefined;
    expect(payload).toBeDefined();
    expect(Number.isFinite(payload!.newOffsetRows)).toBe(true);
    h.cleanup();
  });

  test("wheel-down when already at tail emits no dispatch (no infinite loops)", async () => {
    const focused = agent(new Array(3).fill(0).map(() => turn("x")));
    const h = await mountAsync(focused);
    const before = h.out.types.length;
    h.instance.stdin.write(WHEEL_DOWN);
    await new Promise((r) => setTimeout(r, 30));
    expect(h.out.types.length).toBe(before);
    h.cleanup();
  });

  test("left click produces no dispatch (parser absorbs the SGR sequence)", async () => {
    const focused = agent(new Array(60).fill(0).map(() => turn("x")));
    const h = await mountAsync(focused);
    const before = h.out.types.length;
    h.instance.stdin.write(CLICK_LEFT);
    await new Promise((r) => setTimeout(r, 30));
    expect(h.out.types.length).toBe(before);
    h.cleanup();
  });

  test("scroll-down into tail from a finite offset dispatches JUMP_CHAT to tail", async () => {
    const focused = agent(new Array(60).fill(0).map(() => turn("x")));
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.scrollChat(AGENT_ID, 5));
    const types: string[] = [];
    const payloads: unknown[] = [];
    const dispatch = (action: Action): void => {
      types.push(action.type);
      payloads.push(action.payload);
      stateStore.dispatch(action);
    };
    const ctx = makeContextValue({ stateStore, dispatch });
    const instance = render(
      <TuiContext.Provider value={ctx}>
        <ChatWheelInput focused={focused} width={80} height={20} linesPerNotch={500} />
      </TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    instance.stdin.write(WHEEL_DOWN);
    await new Promise((r) => setTimeout(r, 30));
    expect(types.at(-1)).toBe(JUMP_CHAT_TYPE);
    const lastPayload = payloads.at(-1) as { agentId: AgentId; target: "top" | "tail" };
    expect(lastPayload.agentId).toBe(AGENT_ID);
    expect(lastPayload.target).toBe("tail");
    instance.unmount();
  });
});
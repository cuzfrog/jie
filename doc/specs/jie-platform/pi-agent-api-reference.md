# pi-agent API Reference

The subset of `@earendil-works/pi-agent-core` used by `jie-platform`. Implementers should use this as the authoritative contract for the pi-agent side of the integration. See `specs/jie-platform/06-agent-model.md` "pi-agent Integration Contract" for how Jie bridges events, adapts tools, and manages memory.

---

## Agent

The `Agent` class is the LLM-driven agent loop. Jie wraps it via `AgentBody` — the body instantiates it, subscribes to events, and bridges them to Jie's EventBus.

```typescript
class Agent {
  constructor(options?: AgentOptions);

  // ── State (getter, returns AgentState snapshot) ──
  get state(): AgentState;

  // ── Lifecycle ──
  subscribe(listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void): () => void;
  prompt(message: AgentMessage | AgentMessage[]): Promise<void>;
  prompt(input: string, images?: ImageContent[]): Promise<void>;
  continue(): Promise<void>;
  waitForIdle(): Promise<void>;
  reset(): void;

  // ── Steering (message injection) ──
  steer(message: AgentMessage): void;
  followUp(message: AgentMessage): void;
  clearSteeringQueue(): void;
  clearFollowUpQueue(): void;
  clearAllQueues(): void;
  hasQueuedMessages(): boolean;
  set steeringMode(mode: QueueMode);
  get steeringMode(): QueueMode;
  set followUpMode(mode: QueueMode);
  get followUpMode(): QueueMode;

  // ── Abort & signal ──
  get signal(): AbortSignal | undefined;
  abort(): void;

  // ── Public settable properties (set at construction or afterward) ──
  convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  streamFn: StreamFn;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  onPayload?: SimpleStreamOptions["onPayload"];
  onResponse?: SimpleStreamOptions["onResponse"];
  beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
  afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>;
  prepareNextTurn?: (signal?: AbortSignal) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined;
  sessionId?: string;
  thinkingBudgets?: ThinkingBudgets;
  transport: Transport;
  maxRetryDelayMs?: number;
  toolExecution: ToolExecutionMode;
}
```

**Usage notes:**
- `prompt()` starts a new conversation turn. Blocks until the agent reaches idle.
- `continue()` resumes from the current transcript. The last message must be a user or tool-result message.
- `steer()` queues a message to inject after the current assistant turn finishes. Jie does not use `steer` in v1 (no grace turn).
- `followUp()` queues a message to inject after the agent would otherwise stop.
- `subscribe()` returns an unsubscribe function. Event listener receives an `AbortSignal` for the current run.

---

## AgentOptions

Constructor options for `Agent`. All optional. Jie sets `initialState` for system prompt, model, tools via `agent.state` after construction.

```typescript
interface AgentOptions {
  initialState?: Partial<Omit<AgentState, "pendingToolCalls" | "isStreaming" | "streamingMessage" | "errorMessage">>;
  convertToLlm?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  streamFn?: StreamFn;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  onPayload?: SimpleStreamOptions["onPayload"];
  onResponse?: SimpleStreamOptions["onResponse"];
  beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
  afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>;
  prepareNextTurn?: (signal?: AbortSignal) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined;
  steeringMode?: QueueMode;
  followUpMode?: QueueMode;
  sessionId?: string;
  thinkingBudgets?: ThinkingBudgets;
  transport?: Transport;
  maxRetryDelayMs?: number;
  toolExecution?: ToolExecutionMode;
}
```

**Jie's usage:** Jie sets `steeringMode: "all"`, `toolExecution: "sequential"`, and wires `beforeToolCall`, `afterToolCall`, `transformContext`, `convertToLlm` to bridge events and manage memory. `prepareNextTurn` is **not wired** in v1 — prompt injection uses `agent.prompt()` from the body's in-memory queue after `agent_end` (see `06-agent-model.md` "Subscription Model").

---

## AgentState

```typescript
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;

  // Tools
  set tools(tools: AgentTool<any>[]);
  get tools(): AgentTool<any>[];

  // Transcript
  set messages(messages: AgentMessage[]);
  get messages(): AgentMessage[];

  // Runtime (readonly)
  readonly isStreaming: boolean;
  readonly streamingMessage?: AgentMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}
```

**Jie's usage:** After construction, Jie sets `agent.state.tools`, `agent.state.systemPrompt`, and `agent.state.model`. On memory restore, Jie pushes restored messages into `agent.state.messages`.

---

## AgentMessage

The union of all message types in the agent's conversation transcript.

```typescript
type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
```

The `CustomAgentMessages` interface is extensible via TypeScript declaration merging. pi-agent-core ships it empty — there are no built-in extensions; apps add their own message roles by extending it.

The base `Message` type (from `@earendil-works/pi-ai`):

```typescript
type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

### UserMessage

```typescript
interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;               // Unix ms
}
```

### AssistantMessage

```typescript
interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];  // ordered arbitrarily
  api: Api;
  provider: ProviderId;
  model: string;
  responseModel?: string;
  responseId?: string;
  diagnostics?: AssistantMessageDiagnostic[];
  usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  timestamp: number;
}
```

### ToolResultMessage

```typescript
interface ToolResultMessage<TDetails = any> {
  role: "toolResult";
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];
  details?: TDetails;
  isError: boolean;
  timestamp: number;
}
```

### Content Blocks

```typescript
interface TextContent {
  type: "text";
  text: string;
  textSignature?: string;
}

interface ThinkingContent {
  type: "thinking";
  thinking: string;
  thinkingSignature?: string;
  redacted?: boolean;
}

interface ImageContent {
  type: "image";
  data: string;           // base64
  mimeType: string;
}

interface ToolCall {
  type: "toolCall";
  id: string;
  name: string;
  arguments: Record<string, any>;
  thoughtSignature?: string;
}
```

---

## AgentTool

The tool interface pi-agent expects. Jie tools are adapted to this shape at `AgentBody` construction. The `execute` function takes `toolCallId`, typed `params`, an optional `AbortSignal`, and an optional `onUpdate` callback for streaming partial results.

```typescript
interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> {
  name: string;
  description: string;
  label: string;                                    // human-readable, for UI
  parameters: TParameters;                          // TypeBox schema (from pi-ai's Tool)

  /** Optional: shim raw LLM arguments before schema validation. */
  prepareArguments?: (args: unknown) => Static<TParameters>;

  execute: (
    toolCallId: string,
    params: Static<TParameters>,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback<TDetails>,
  ) => Promise<AgentToolResult<TDetails>>;

  /** Per-tool execution mode override. */
  executionMode?: ToolExecutionMode;
}
```

### AgentToolResult

```typescript
interface AgentToolResult<T> {
  content: (TextContent | ImageContent)[];
  details: T;
  /** Hint: agent should stop after the current tool batch. */
  terminate?: boolean;
}

type AgentToolUpdateCallback<T = any> = (partialResult: AgentToolResult<T>) => void;
```

---

## AgentEvent

All 10 events emitted via `agent.subscribe(listener)`. Jie bridges these to its EventBus.

```typescript
type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean };
```

| Event | Emitted when | Jie bridges to |
|---|---|---|
| `agent_start` | Agent processing loop begins | — (internal) |
| `agent_end` | Agent processing loop complete; all messages produced | Triggers `agent.idle` publish |
| `turn_start` | New assistant turn begins | — (internal) |
| `turn_end` | Assistant turn complete (response + any tool results) | Turn bookkeeping. pi-agent decides loop continuation based on `message.stopReason` and `ToolResult.terminate`. |
| `message_start` | Any message added to transcript | — (internal) |
| `message_update` | Token delta during assistant streaming | `agent.stream.chunk` (buffered) |
| `message_end` | Message finalized | `memory.persist()` |
| `tool_execution_start` | Tool about to execute | `agent.tool.call` (via `beforeToolCall` hook) |
| `tool_execution_update` | Tool streaming partial result | — (deferred Day 2) |
| `tool_execution_end` | Tool execution complete | `agent.tool.result` (via `afterToolCall` hook) |

---

## BeforeToolCall / AfterToolCall

Hook functions wired at agent construction. Jie uses these for tool telemetry events.

> **Note on the hook context (pi-agent-core 0.80.5).** The hook context shape is `{ assistantMessage, toolCall, args, context }`; the tool id and tool name are read from `ctx.toolCall.id` and `ctx.toolCall.name`. The `BeforeToolCallResult` shape is `{ block?, reason? }`.

```typescript
interface BeforeToolCallContext {
  /** The assistant message that requested the tool call. */
  assistantMessage: AssistantMessage;
  /** The raw tool call block from `assistantMessage.content`. */
  toolCall: AgentToolCall;
  /** Validated tool arguments for the target tool schema. */
  args: unknown;
  /** Current agent context at the time the tool call is prepared. */
  context: AgentContext;
}

interface BeforeToolCallResult {
  /** Block execution: pi-agent emits a synthetic tool-result error instead. */
  block?: boolean;
  /** Reason text shown in the synthetic error tool result. */
  reason?: string;
}

interface AfterToolCallContext {
  /** The assistant message that requested the tool call. */
  assistantMessage: AssistantMessage;
  /** The raw tool call block from `assistantMessage.content`. */
  toolCall: AgentToolCall;
  /** Validated tool arguments for the target tool schema. */
  args: unknown;
  /** The executed tool result before any `afterToolCall` overrides are applied. */
  result: AgentToolResult<any>;
  /** Whether the executed tool result is currently treated as an error. */
  isError: boolean;
  /** Current agent context at the time the tool call is finalized. */
  context: AgentContext;
}

interface AfterToolCallResult {
  /** Field-by-field partial override of the tool result the LLM sees. */
  content?: (TextContent | ImageContent)[];
  details?: unknown;
  isError?: boolean;
  /** Hint: stop after the current tool batch. */
  terminate?: boolean;
}
```

---

## AgentLoopTurnUpdate

Returned by `prepareNextTurn` to modify state before the next turn.

```typescript
interface AgentLoopTurnUpdate {
  context?: AgentContext;       // full context replacement
  model?: Model<any>;           // model switch
  thinkingLevel?: ThinkingLevel;
}
```

---

## Mode Types

```typescript
type QueueMode = "all" | "one-at-a-time";
// - "all": drain all queued messages at once
// - "one-at-a-time": drain only the oldest queued message

type ToolExecutionMode = "sequential" | "parallel";
// - "sequential": execute tools one at a time
// - "parallel": execute compatible tools concurrently

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
```

**Jie v1 defaults:** `steeringMode: "all"`, `toolExecution: "sequential"`. `followUpMode` left at pi-agent default (`"one-at-a-time"`).

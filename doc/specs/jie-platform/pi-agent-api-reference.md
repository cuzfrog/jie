# pi-agent API Reference

The subset of `@earendil-works/pi-agent-core` used by `jie-platform`. This is the dependency contract — the authoritative source for how Jie bridges events, adapts tools, and manages memory is `06-agent-model.md`. Follow pi conventions and reuse what it provides.

## Agent

The `Agent` class is the LLM-driven agent loop. Jie wraps it via `AgentBody` (`core/agent-body.ts`): the body instantiates it, subscribes to events, and bridges them to Jie's EventBus.

```typescript
class Agent {
  constructor(options?: AgentOptions);

  get state(): AgentState;

  subscribe(listener: (event: AgentEvent, signal: AbortSignal) => Promise<void> | void): () => void;
  prompt(message: AgentMessage | AgentMessage[]): Promise<void>;
  prompt(input: string, images?: ImageContent[]): Promise<void>;
  continue(): Promise<void>;
  waitForIdle(): Promise<void>;
  reset(): void;

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

  get signal(): AbortSignal | undefined;
  abort(): void;

  convertToLlm: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  streamFn: StreamFn;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  onPayload?: SimpleStreamOptions["onPayload"];
  onResponse?: SimpleStreamOptions["onResponse"];
  beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
  afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>;
  prepareNextTurnWithContext?: (context: PrepareNextTurnContext) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined;
  sessionId?: string;
  thinkingBudgets?: ThinkingBudgets;
  transport: Transport;
  maxRetryDelayMs?: number;
  toolExecution: ToolExecutionMode;
}
```

`prompt()` starts a new conversation turn and blocks until the agent reaches idle. `continue()` resumes from the current transcript (last message must be a user or tool-result message). `steer()` injects a message after the current turn; `followUp()` queues one after the agent would otherwise stop. `subscribe()` returns an unsubscribe function; the listener receives an `AbortSignal` for the current run.

## AgentOptions

```typescript
interface AgentOptions {
  initialState?: Partial<Omit<AgentState, "pendingToolCalls" | "isStreaming" | "streamingMessage" | "errorMessage">>;
  convertToLlm?: (messages: AgentMessage[]) => Message[] | Promise<Message[]>;
  transformContext?: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  streamFn: StreamFn;
  getApiKey?: (provider: string) => Promise<string | undefined> | string | undefined;
  onPayload?: SimpleStreamOptions["onPayload"];
  onResponse?: SimpleStreamOptions["onResponse"];
  beforeToolCall?: (context: BeforeToolCallContext, signal?: AbortSignal) => Promise<BeforeToolCallResult | undefined>;
  afterToolCall?: (context: AfterToolCallContext, signal?: AbortSignal) => Promise<AfterToolCallResult | undefined>;
  prepareNextTurnWithContext?: (context: PrepareNextTurnContext) => Promise<AgentLoopTurnUpdate | undefined> | AgentLoopTurnUpdate | undefined;
  steeringMode?: QueueMode;
  followUpMode?: QueueMode;
  sessionId?: string;
  thinkingBudgets?: ThinkingBudgets;
  transport?: Transport;
  maxRetryDelayMs?: number;
  toolExecution?: ToolExecutionMode;
}
```

`streamFn` is required; the rest are optional. Jie sets `streamFn: streamSimple` (from `@earendil-works/pi-ai/compat`), `steeringMode: "all"`, `followUpMode: "all"`, `toolExecution: "sequential"`, and wires `beforeToolCall`/`afterToolCall`/`transformContext`/`convertToLlm`/`prepareNextTurnWithContext` per `06-agent-model.md`.

## AgentState

Settable at construction or afterward; readonly runtime fields noted.

```typescript
interface AgentState {
  systemPrompt: string;
  model: Model<any>;
  thinkingLevel: ThinkingLevel;
  set tools(tools: AgentTool<any>[]);
  get tools(): AgentTool<any>[];
  set messages(messages: AgentMessage[]);
  get messages(): AgentMessage[];
  readonly isStreaming: boolean;
  readonly streamingMessage?: AgentMessage;
  readonly pendingToolCalls: ReadonlySet<string>;
  readonly errorMessage?: string;
}
```

## AgentMessage

```typescript
type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
```

The `CustomAgentMessages` interface is extensible via declaration merging; pi-agent-core's harness ships four extensions — `compactionSummary`, `branchSummary`, `bashExecution`, `custom` — of which jie uses `compactionSummary` only.

The base `Message` type (from `@earendil-works/pi-ai`):

```typescript
type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

```typescript
interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;               // Unix ms
}

interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
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

### CompactionSummaryMessage

```typescript
interface CompactionSummaryMessage {
  role: "compactionSummary";
  summary: string;
  tokensBefore: number;
  timestamp: number;               // Unix ms
}
```

Created with `createCompactionSummaryMessage(summary, tokensBefore, timestamp)`. The harness's `convertToLlm` maps the role to a `UserMessage` whose text wraps the summary — Jie passes this `convertToLlm` to its `Agent` (`06-agent-model.md` "Compaction") and writes the message through `transcriptStore.compact` (`08-transcript.md` "Compact").

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

## AgentTool

The tool interface pi-agent expects. Jie tools are adapted to this shape at `AgentBody` construction (`06-agent-model.md` "Tool Adaptation").

```typescript
interface AgentTool<TParameters extends TSchema = TSchema, TDetails = any> {
  name: string;
  description: string;
  label: string;
  parameters: TParameters;
  prepareArguments?: (args: unknown) => Static<TParameters>;
  execute: (toolCallId: string, params: Static<TParameters>, signal?: AbortSignal, onUpdate?: AgentToolUpdateCallback<TDetails>) => Promise<AgentToolResult<TDetails>>;
  executionMode?: ToolExecutionMode;
}

interface AgentToolResult<T> {
  content: (TextContent | ImageContent)[];
  details: T;
  terminate?: boolean;
}

type AgentToolUpdateCallback<T = any> = (partialResult: AgentToolResult<T>) => void;
```

## AgentEvent

All 10 events emitted via `agent.subscribe(listener)`:

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

How Jie bridges each onto the EventBus is in `06-agent-model.md` "Event Bridging"; the tool telemetry path uses the `beforeToolCall`/`afterToolCall` hooks, not `tool_execution_*`.

## BeforeToolCall / AfterToolCall

Hook functions wired at agent construction. Jie uses these for tool telemetry (`agent.tool.call` / `agent.tool.result`) and the command hooks (`06-agent-model.md` "Tool telemetry hooks", `10-configuration.md` "Hooks").

> Note on the hook context (pi-agent-core 0.83.0). The hook context shape is `{ assistantMessage, toolCall, args, context }`; the tool id and tool name are read from `ctx.toolCall.id` and `ctx.toolCall.name`. The `BeforeToolCallResult` shape is `{ block?, reason? }`.

```typescript
interface BeforeToolCallContext {
  assistantMessage: AssistantMessage;
  toolCall: AgentToolCall;
  args: unknown;
  context: AgentContext;
}
interface BeforeToolCallResult { block?: boolean; reason?: string }

interface AfterToolCallContext {
  assistantMessage: AssistantMessage;
  toolCall: AgentToolCall;
  args: unknown;
  result: AgentToolResult<any>;
  isError: boolean;
  context: AgentContext;
}
interface AfterToolCallResult {
  content?: (TextContent | ImageContent)[];
  details?: unknown;
  isError?: boolean;
  terminate?: boolean;
}
```

## AgentLoopTurnUpdate

```typescript
interface AgentLoopTurnUpdate {
  context?: AgentContext;
  model?: Model<any>;
  thinkingLevel?: ThinkingLevel;
}
```

## Mode Types

```typescript
type QueueMode = "all" | "one-at-a-time";
type ToolExecutionMode = "sequential" | "parallel";
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
```

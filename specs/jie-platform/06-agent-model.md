# Agent Model

## AgentSoul

A soul declares an agent's behavioral profile. Souls are derived from the team blueprint at startup — the platform parses declarative config and constructs souls from it. No roles are hardcoded.

```typescript
interface AgentSoul {
  role:            string;      // agent identifier — the agent's .md filename stem (canonical, see ADR 18)
  model:           string;      // '<provider>/<model_id>', split on first '/', resolved via pi-ai's getModel(provider, modelId)
  system_prompt:   string;      // prose body of the agent's .md file
  tools:           ToolSpec[];  // from frontmatter `tools`, resolved through ToolRegistry
  subscribe:       string[];    // from frontmatter `subscribe:` if present, else `[]` — domain topics this agent listens to
  subscriptions:   string[];    // auto-computed by platform (agent does not declare this)
}
```

Agents communicate exclusively through `notify` (publishing to topics) and subscription-based ingress. They have no direct references to other agents.

The `system_prompt` is the markdown prose from the agent's `.md` file, verbatim. No fragmentation into identity/tools_guide/constraints/prose — it's one block the LLM sees as its system message.

`ToolSpec` is a string in one of three shapes:

| Shape | Meaning |
|---|---|
| `tool_name` | A built-in tool. Resolved against the built-in tool registry. |
| `mcp:<server>:<method>` | A specific tool on an MCP server. At startup, the body connects to `<server>`, fetches the schema for `<method>`, and registers a first-class `Tool` whose `execute` dispatches over MCP. |
| `mcp:<server>:<glob>` | A glob over the server's tool names. At startup, the body connects to `<server>`, fetches the full catalog, and registers each matching tool as a first-class `Tool`. |

**Glob semantics** for the third shape:

- Two metacharacters: `*` matches any run of characters including the empty string; `?` matches exactly one character. No other characters carry special meaning.
- The pattern is **anchored** to the full tool name: the glob must match start to end.
- Matching is **case-sensitive**.
- A pattern containing no metacharacters is equivalent to `mcp:<server>:<method>` (single specific tool, must exist or startup fails).
- A pattern that matches zero tools is a startup failure.

The LLM sees every tool — built-in or MCP-backed — with its real schema in its tool list. There is no `use_mcp` meta-tool.

### ToolRegistry

Central catalog of all tools available to agents. The platform feeds it — built-in tools at startup, MCP server tools on connection. The registry is storage-agnostic: a `Tool` is a `Tool`, regardless of whether its `execute` implementation delegates over MCP or does local work.

```typescript
interface ToolRegistry {
  register(name: string, tool: Tool): void;
  resolve(spec: string): Tool[];    // glob-expands mcp:server:*; specific spec returns one
  list(): Tool[];
}
```

- `register` — adds a tool. Duplicate names replace the prior entry (last writer wins).
- `resolve` — matches the spec string against registered tool names using anchored shell-style glob (`*`, `?`). Returns matched `Tool` instances. A specific name returns `[Tool]`. A glob returns zero-or-more; zero matches signals "nothing resolved" (the caller decides whether that is a startup failure).
- `list` — returns all registered tools for introspection.

## Blueprint Loading

The team blueprint lives at `.jie/teams/<team_name>/`:

```
.jie/teams/default/
  TEAM.md              # frontmatter: leader, optional per-role instances
  leader.md            # agent files — filename (stem) is the role identifier
  worker_a.md
  worker_b.md
```
  
The `jie-team` package ships a concrete blueprint with 6 roles (DM, Researcher, Architect, Planner, Implementer, Reviewer). See the `jie-team` package documentation for the role definitions.

### TEAM.md

Minimal wiring — declares the leader role and optional per-role instance counts:

```yaml
---
leader: leader
# Day 2 — multi-instance roles. v1: every role has exactly 1 instance.
# instances:
#   worker_a: 1
#   worker_b: 2
---
```

All `.md` files in the directory besides `TEAM.md` are agent definitions. Filename (stem) is the role identifier. Each role maps to a persistent `agent_key = {role}-{N}`. In v1 with one instance per role, keys are `{role}-1` (e.g. `leader-1`, `worker_a-1`). Multi-instance roles (`N > 1`) are deferred to Day 2.

### Agent .md

Frontmatter declares the mechanical surface; prose body is the system prompt:

```yaml
---
model: anthropic/claude-sonnet-4
tools:
  - web_search
  - web_fetch
  - write_artifact
  - read_artifact
subscribe:
  - task.recorded
---

# System Prompt

You are a researcher agent. Your job is...

When you finish, call `notify('task.researched', '...')` to signal completion.
```

**Frontmatter fields:**

| Field | Required | Description |
|---|---|---|
| `model` | no | `<provider>/<model_id>` string. Split on first `/` → `getModel(provider, modelId)` via pi-ai. If absent, inherited from the user's global default at startup (see `10-configuration.md` "Model Resolution"). |
| `tools` | yes | list of tool spec strings. Resolved through `ToolRegistry` at load time. |
| `subscribe` | no | list of domain topic strings this agent listens to (in addition to its auto-subscriptions). If absent, the agent has no domain subscriptions — only `{agent_key}` (every agent) and `leader.prompt` (leader only). The leader for example omits this field; the built-in minimal team's `general` agent omits it too. |

The role identifier is the `.md` filename stem — there is no `name:` frontmatter override (see ADR 18). The directory must not contain two `.md` files with the same stem (the loader treats duplicate stems as a parse-time error).

**Prose body** → `AgentSoul.system_prompt`. Provided to the LLM as the system message.

### Model Resolution

The `model:` field is optional. When absent, the platform falls through to the user's global default — see `10-configuration.md` "Model Resolution" for the full chain. The `AgentSoul.model` value is always a resolved `<provider>/<modelId>` string by the time the soul is constructed; the frontmatter field is just the agent's *explicit override* slot.

If a model string is present but malformed (no `/` separator), the platform fails at startup with `invalid model string: <value>` citing the agent's role. The error is part of the startup pre-check (run by `startJie`) (see "Startup Pre-Check" below).

### Startup Pre-Check

`startJie` walks every agent in the blueprint before constructing any `AgentSoul`. For each agent it attempts to resolve a concrete `(provider, modelId)`. If any agent fails, startup exits 1 with a single error message:

```
No model has been selected, please login and select a default model.
```

(Matches the user scenario 6 expected error. The platform's CLI maps from the internal "no `defaultProvider` and no per-agent `model:`" condition to this user-facing message.)

This is a hard fail — no partial startup, no agent constructed. `startJie` does not surface a "missing model" error at LLM-call time; that class of error is caught here.

### Platform Auto-Wiring

After parsing, the platform constructs `AgentSoul` instances with auto-computed subscriptions. Every agent auto-subscribes to its own `{agent_key}` for direct addressing. The leader additionally auto-subscribes to `leader.prompt` for user input.

| Subscription | Who gets it |
|---|---|
| `{agent_key}` | Every agent (auto, based on role name and instance N) |
| `leader.prompt` | Leader only (auto, based on `TEAM.md` `leader` field) |
| Domain topics from `subscribe:` | Per agent `.md` frontmatter, if the field is present |

`subscribe:` is optional in the frontmatter (see Frontmatter fields above). When absent, the agent's only subscriptions are the auto-subscriptions in the first two rows. The platform's auto-wiring never adds other subscriptions.

## Tool

Jie tools use TypeBox schemas (matching `@earendil-works/pi-ai`'s type system). At AgentBody construction, each Jie `Tool` is adapted into pi-agent's `AgentTool` interface.

```typescript
interface Tool<TInput = any> {
  name:        string;
  description: string;
  label:       string;                          // human-readable name for UI / telemetry
  timeout?:    number;                          // per-invocation timeout in ms (default 120_000)
  parameters:  TSchema;                         // TypeBox schema — defines LLM-visible tool schema
  execute(input: TInput, ctx: ExecutionContext, signal?: AbortSignal): Promise<ToolResult>;
}
```

```typescript
interface ToolResult {
  content:   string;          // text returned to the LLM conversation
  details?:  unknown;         // structured details for afterToolCall hooks
  terminate?: boolean;        // hint: stop LLM loop after this tool batch (optional)
}
```

Tools are plain typed functions. With one exception (the built-in `notify` tool, see below), tools have no awareness of the event bus. MCP-backed tools implement the same interface; the MCP call is an implementation detail of `execute`. Custom team-defined tools cannot publish events.

**Timeout.** Every tool call has a default timeout of **120 seconds**. The adaptation layer combines any pi-agent-provided `signal` with `AbortSignal.timeout(tool.timeout ?? 120_000)`. Tools receive the combined `signal` and should abort when it fires. Individual tools may override the default (e.g. `bash` uses 300s). MCP tools inherit the 120s default.

### Tool Adaptation to pi-agent

At `AgentBody` construction, each Jie `Tool` is wrapped into pi-agent's `AgentTool`:

| pi-agent field | Jie source |
|---|---|
| `name` | `Tool.name` |
| `description` | `Tool.description` |
| `label` | `Tool.label` |
| `parameters` | `Tool.parameters` (TypeBox, passed directly) |
| `prepareArguments` | `TypeBox.Value.Check(parameters, raw)` — validates the LLM-supplied args against the TypeBox schema. Throws when the check returns `false`; pi-agent surfaces the throw as a tool error to the LLM. No coercion in v1 — the LLM's args must already match the schema. |
| `execute(toolCallId, params, signal?, onUpdate?)` | Calls `tool.execute(params, ctx)` → wraps return as `{ content: [{ type: "text", text: result.content }], details: result.details, terminate: result.terminate }`. Passes `onUpdate` through for tools that stream partial results. |
| `executionMode` | Always `"sequential"` in v1 (parallel tool execution deferred to Day 2) |

Most built-in tools return synchronous results and ignore `onUpdate`. Tools like `bash` may use `onUpdate` for live stdout streaming.

### Built-in Tool: `notify`

`notify` is auto-registered on every agent body. It is the LLM's sole means of publishing an event to another agent or to a domain topic.

```typescript
notify(input: { topic: string; prompt: string }): string  // LLM-visible text; see below
```

Behavior inside the body:

1. Publish `{ topic, prompt, source: this.agent_key }` to `{topic}` on the event bus.
2. The publishing agent's `AgentBody` subscription callback filters self-receipt: when the callback receives an event whose `payload.source` matches its own `agent_key`, it skips processing (per ADR 9 §3 — `Self-receipt filtering`). The `EventBus` itself is transport-agnostic and does not know about agent identity; putting the filter on the bus would leak Jie agent concepts into the transport, and a future `NatsEventBus` would have no agent-key awareness to filter against. The bus also catches per-subscriber exceptions (see `03-event-system.md` "Error Containment") and continues dispatch — a misbehaving subscriber does not poison the publisher.
3. The LLM-visible return is a human-readable string summarizing delivery. The LLM-facing `recipients` count is `subscriberCount(topic)` minus self if the publisher is itself subscribed to `topic` (i.e., if the topic is in `AgentSoul.subscriptions`). The bus-level `subscriberCount(topic)` is the raw transport count and is unchanged; the LLM-facing number is the count of OTHER agents that would receive the message after self-receipt filtering. `details.recipients` carries the same LLM-facing number — observers see what the LLM was told.

   | LLM-facing `recipients` | LLM-visible `content` |
   |---|---|
   | `> 0` | `"Notification delivered to N recipients"` |
   | `0` | `"Notification delivered to 0 recipients — no agent is subscribed to '<topic>'"` |

   The zero case is **explicit** because it is the LLM's signal to react: the topic name is unknown, no peer is listening, the message would be lost. The LLM should reconsider the topic, fall back to a different path, or surface the issue to the user.
4. The body also returns `details = { topic, recipients }` to the LLM pipeline for afterToolCall hooks (TUI render, diagnostics). The `details` field is opaque to the LLM conversation but is visible to observers. The `recipients` value is the LLM-facing number from step 3.
5. The LLM continues processing — `notify` does **not** end the turn loop.

On receipt, an agent formats the notification as a synthetic `user` message in the LLM conversation: `[{source_agent_key} on '{topic}']: {prompt}` — the "notify path" format from the table in "Prompt Ingress & Queuing" below. (The `leader.prompt` source has no `source_agent_key`, so it uses `[user]: {prompt}` instead.)

The built-in team blueprint uses domain topics for pipeline progression. Prose examples use shorthand `notify('topic', 'prompt')` for readability; the actual LLM call follows the TypeBox schema: `notify({ topic: string, prompt: string })`.

**Business identifiers are not a platform concept.** `task_id`, `work_id`, and any other team-defined identifier are the **team's** concern, not the platform's. The body treats the `topic` and `prompt` of a `notify` call as opaque strings; it does not parse them for business meaning. The receiving agent's LLM extracts identifiers from the synthetic `user` message as part of its reasoning. The platform has no `task_id` field, no work-tracking primitive, and no implicit propagation of identifiers across turns. This is consistent with ADR 7 (which removed `work_id` from `ExecutionContext`): the platform is generic; the team owns its own identifier scheme.

### Built-in Tool: `bash`

`bash` executes shell commands within the workspace root.

```typescript
bash(input: { command: string; workdir?: string }): BashResult

interface BashResult {
  exit_code: number;
  stdout:    string;
  stderr:    string;
  truncated: { stdout: boolean; stderr: boolean };
}
```

Rules:

- The command execs in the team's workspace root by default. `workdir`, if provided, is resolved relative to the workspace root. Path resolution uses `realpath`; the resolved absolute path must start with the resolved absolute workspace root path. Any `workdir` that resolves outside the workspace root results in a tool-error (`workdir_escape`).
- A fixed timeout (default 300s per invocation) kills the process and returns a tool error (`command_timed_out`). The agent sees this as a failed tool invocation.
- The command runs with the workspace's environment (inherited from the agent process). No isolation sandbox beyond the workspace-root constraint in v1.
- Shell is `/bin/sh` (POSIX).
- Output: `stdout` and `stderr` are each independently truncated to **32 KiB**. The `truncated` field reports which streams were clipped. A truncated stream has a marker `[truncated to 32 KiB]` appended at the point of truncation.
- **Result shape returned to the LLM.** The bash tool's `execute` returns a `ToolResult` with a string `content` (the only thing the LLM sees) and a structured `details` for afterToolCall hooks:

  ```typescript
  {
    content: `exit_code: <N>[( command failed) when N != 0]
  --- stdout ---
  <output>[ [truncated to 32 KiB] if truncated.stdout ]`,
    details: { exitCode: number, truncated: { stdout: boolean; stderr: boolean } }
  }
  ```

  Format rules:
  - The `exit_code: <N>` line is always present. The `( command failed)` suffix is appended when `N != 0` so the LLM sees the failure clearly without losing the actual output.
  - `--- stdout ---` and `--- stderr ---` section headers are emitted; if a section's content is empty, the section is omitted entirely (no header with empty body).
  - The `[truncated to 32 KiB]` marker is appended to the truncated stream's content, *inside* its section.
  - The command itself is **not** echoed in the output — the LLM knows what it sent.
  - `details` carries the structured `exitCode` and `truncated` flags for afterToolCall hooks (TUI render, diagnostics).
- **Failure mode.** Bash **does not throw on non-zero exit code**. The LLM reads the exit code from the text and reasons about it. Throwing would set `isError: true` in pi-agent's `ToolResultMessage` but discard stdout/stderr — the LLM would lose the actual output, which is precisely what it asked for. Conveying failure in the text is the correct trade-off.

### Built-in Tools: `web_search` and `web_fetch`

```typescript
web_search(input: { query: string; max_results?: number }): WebSearchResult[]

interface WebSearchResult {
  title:   string;
  url:     string;
  snippet: string;
}

web_fetch(input: { url: string }): { content: string; truncated: boolean }
```

These are built-in tools in `packages/jie-platform/tools/`. They implement the `Tool` interface and are pluggable — the team blueprint may include or exclude them from specific roles.

#### `web_search` Backend

The `web_search` tool delegates to a `WebSearchProvider` implementation. The default provider scrapes DuckDuckGo HTML (`https://html.duckduckgo.com/html/`) — no API key required, works out of the box. The provider interface is narrow so alternative backends (Brave, Tavily, self-hosted SearXNG) can be plugged in later.

```typescript
interface WebSearchProvider {
  search(query: string, max_results: number): Promise<WebSearchResult[]>;
}
```

The platform registers one provider at startup. The `web_search` tool calls the registered provider and returns its results as-is. v1 ships only the DuckDuckGo adapter; alternative providers are a Day 2 concern.

#### `web_fetch` HTTP Client Policy

| Policy | Value |
|---|---|
| URL schemes | `http`, `https` only. Other schemes (e.g. `file:`, `ftp:`, `data:`) are rejected with a tool error. |
| Redirects | Follow up to 5 hops. |
| Max response body | 5 MiB. Larger responses are truncated at 5 MiB and `truncated: true` is set. |
| TLS | Validation enabled. Self-signed certs are not accepted in v1. |
| User-Agent | `JieBot/0.1 (+https://github.com/cuzfrog/jie)` |
| Timeout | Inherits the tool's 120s default. |
| Encoding | UTF-8 default; if `Content-Type` declares a charset, that charset is used. |
| Content conversion | HTML is parsed with `node-html-parser@6.1.13` (per `monorepo-structure.md` runtime deps). The parser removes `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>` elements and their descendants, then returns the text content. `node-html-parser`'s text extraction decodes HTML entities (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#NNN;`, `&xHHHH;`) — no separate unescape step needed. The returned text may contain residual whitespace from block-level tags; the LLM tolerates this. Non-HTML responses (e.g. `text/plain`, `application/json`, `application/xml`) skip the parser and return verbatim. |

The return type is `{ content: string; truncated: boolean }` — the interface is **format-agnostic**. The `content` field carries whatever text the adapter produces; the tool contract is just "give the LLM the text and tell it if you had to cut it off."

### Built-in Tools: `write_artifact` and `read_artifact`

Wrappers over the `ArtifactStore` interface (see `05-artifact-store.md`):

```typescript
write_artifact(input: { key: string; content: string }): { key: string; created_at: string }
read_artifact(input: { key: string }): { key: string; content: string; created_at: string } | null
```

The TypeScript signatures above are the LLM-facing return shapes. The tool's `execute` returns a `ToolResult` (per the `Tool` interface); the field mapping is:

| Tool | `ToolResult.content` (LLM-visible text) | `ToolResult.details` (afterToolCall hook) |
|---|---|---|
| `write_artifact` (success) | `\`Stored artifact at ${key} (${content.length} chars)\`` | `{ key, created_at }` |
| `write_artifact` (storage failure) | thrown — tool error surfaced to LLM | n/a |
| `read_artifact` (found) | the artifact's `content` (verbatim, no encoding) | `{ key, content, created_at }` |
| `read_artifact` (missing) | `\`Artifact not found: ${key}\`` | `null` |

- `write_artifact` — stores `content` at `key`. Overwrites if the key exists. Returns the canonical `{ key, created_at }` so the LLM can reference the artifact in subsequent event payloads. On storage failure (e.g. disk full, permission denied), the call surfaces a tool error.
- `read_artifact` — returns the entry at `key`. A missing artifact is a normal result (formatted message in `content`, `null` in `details`), not a tool error — the LLM can reason about the miss.

These are the only two artifact tools exposed to agents. Artifact content is never passed in event payloads; events carry only `artifact_id`.

### Built-in Tool: `read_file`

`read_file` reads the contents of a file at a path within the workspace. Mirrors pi's `read` tool (`@earendil-works/pi-coding-agent/src/core/tools/read.ts`).

```typescript
read_file(input: { path: string; offset?: number; limit?: number }): {
  content: string;
  truncated: { content: boolean };
}
```

Rules:

- `path` is resolved relative to the workspace root. The resolved absolute path must start with the resolved absolute workspace root path. Any `path` that resolves outside the workspace root results in a tool error (`path_escape`).
- `offset` is 1-indexed (line number). `limit` is the maximum number of lines to read.
- Default truncation: **2000 lines OR 50 KiB** (whichever is hit first). `truncated.content` reports whether clipping occurred; a marker `[Truncated: showing X of Y lines (50 KiB limit)]` is appended at the cut point.
- v1 supports **text only**. Image MIME types (`image/jpeg`, `image/png`, `image/gif`, `image/webp`) return a tool error (`unsupported_media_type`). Image attachment support is a Day 2 extension.
- Inherits the tool's 120s default timeout. Reading is synchronous and bounded; timeout only fires on I/O hang.
- Encoding: UTF-8. No charset detection in v1.

Description (LLM-facing):

```
Read the contents of a file at `path` (relative to workspace root, or absolute
within workspace). For text files, output is truncated to 2000 lines or 50 KiB
(whichever is hit first). Use offset/limit for large files. When you need the
full file, continue with offset until complete.
```

### Built-in Tool: `write_file`

`write_file` writes text content to a file at a path within the workspace. It is the natural sibling of `read_file` and completes the platform's file I/O pair. The LLM-facing return string mirrors pi's `write` tool (`@earendil-works/pi-coding-agent/src/core/tools/write.ts`) verbatim, so agents reason about the result the same way.

```typescript
write_file(input: { path: string; content: string }): {
  path:          string;     // canonicalized, workspace-relative
  bytes_written: number;     // = content.length, per pi convention
  created_at:    string;     // ISO 8601 — file's mtime after the write
}
```

- **LLM-visible `content`:** `` `Successfully wrote ${content.length} bytes to ${path}` `` — identical to pi's `write` tool. (Note: the count is `content.length`, a JavaScript char count, not a UTF-8 byte count. The field name `bytes_written` follows pi's naming even though it is technically a misnomer for non-ASCII content. The two concerns are aligned, not diverged, so the LLM is not surprised.)
- **Structured `details`:** the full `{ path, bytes_written, created_at }` object is returned as `details` for afterToolCall hooks (TUI render, diagnostics). The LLM does not see the `details`; only `content` is visible to the conversation.

Rules:

- `path` is resolved relative to the workspace root. The resolved absolute path must start with the resolved absolute workspace root path. Any `path` that resolves outside the workspace root results in a tool error (`path_escape`).
- `content` is written verbatim (no template expansion, no shell interpretation). UTF-8 encoded bytes only.
- Existing files are overwritten (idempotent). There is no separate "create" or "append" mode in v1.
- Missing parent directories are created on write (`mkdir -p` semantics). The platform does not require pre-existing directory structure.
- Inherits the tool's 120s default timeout. Writes are synchronous and bounded; the timeout only fires on I/O hang.
- v1 is **text only** — no binary writes, no encoding conversion, no `mode`/`flags` parameters. The platform treats `content` as UTF-8 text and writes bytes verbatim.
- The platform enforces **workspace-root containment only**. It does **not** check module boundaries, frozen rules, or any other team-defined constraint. Those checks are the team layer's responsibility — see "Boundary Enforcement" below.

Description (LLM-facing):

```
Write `content` to `path` (relative to workspace root, or absolute within workspace).
Overwrites the file if it exists. Creates parent directories as needed. Text only;
content is written verbatim as UTF-8 bytes. The platform enforces workspace containment
(path_escape on violation) but does NOT check module boundaries — for that, the team
blueprint's role system prompt / descriptor contract applies on top.
```

#### Boundary Enforcement (Platform vs Team)

`write_file` enforces only **workspace-root containment** (the `path_escape` rule above). It does **not** enforce module boundaries (frozen rules, descriptor checks). The two enforcement layers are distinct:

| Layer | What it enforces | When it runs | v1 status |
|---|---|---|---|
| Platform `write_file` | "Inside the workspace root" | At the tool call | v1 (this spec) |
| Team descriptor / frozen rule | "Inside the allowed module boundary" | At the role's system prompt or via a wrapper tool that the team defines | `jie-team` backlog (Day 2) |

This separation lets the platform ship a useful writer in v1 without waiting for the team's boundary-enforcement contract. Teams that need module-boundary enforcement wrap the platform's writer (or instruct the agent via system prompt) to validate against the module descriptor before calling `write_file`. Teams that don't need it (e.g. the minimal team) get a plain writer for free.

**Consequence:** in v1, an agent with `write_file` in its tool list can write any file inside the workspace root, including files inside a frozen module. The team layer is responsible for preventing that, not the platform. This is an explicit Day-1 commitment: boundary enforcement is a team-layer contract.

## Tool Telemetry

Every tool call is observable on Jie's event bus. The body wires pi-agent's `beforeToolCall` and `afterToolCall` hooks to emit:

- **`agent.tool.call`** — emitted in `beforeToolCall` (before tool execution). Payload: `tool_call_id: string`, `name`, `input: string` (JSON-serialized LLM-supplied args), `input_truncated`.
- **`agent.tool.result`** — emitted in `afterToolCall` (after execution completes or throws). Payload: `tool_call_id: string`, `name`, `output: string | null` (JSON-serialized `ToolResult`, see below), `output_truncated`, `duration_ms`, `error: string | null`.

**What `output` serializes.** The whole Jie `ToolResult = { content: string; details?: unknown; terminate?: boolean }` returned by the tool's `execute` is serialized — not just `content`. This gives observers (TUI, `-p` mode, diagnostics) both the LLM-visible text **and** the structured `details` (e.g. `bash` returns `details: { exitCode, truncated }`; `notify` returns `details: { topic, recipients }`). The LLM conversation itself still sees only `content` — pi-agent's `execute` wrapping (`{ content: [{ type: "text", text: result.content }], details: result.details, terminate: ... }`) is what the LLM receives; the event `output` is Jie's raw view, with everything preserved for observers. Fields whose value is `undefined` are dropped by `JSON.stringify`; `details` and `terminate` may be absent from the serialized string when the tool does not set them. On a thrown `execute`, `output` is `null` and `error` carries the message.

`tool_call_id` is the string id pi-agent provides in its hook context. The body reads it from the hook context as `ctx.toolCall.id` (in pi-agent-core@0.79.1 the hook context is `{ assistantMessage, toolCall, args, context }`, not the older flat shape) and passes it through to the bus as-is — no Jie-side counter, no Map, no renumbering. The same string appears in both events for the same tool call, which is what observers (TUI, `-p` mode) use to correlate a `call` with its `result`. The id is opaque to Jie; its format is provider-defined (e.g. OpenAI uses `call_xxx`, Anthropic uses `toolu_xxx`).

Input and output are JSON-serialized. If the serialized string exceeds **4 KiB**, it is middle-truncated: the first and last `(4096 - MARKER_LEN) / 2` chars are preserved, with a marker `...[N chars truncated]...` in between.

**Truncation scope.** The 4 KiB middle-truncation applies to the **event payload** published on the bus (for TUI/diagnostic consumption). The LLM itself always sees the full, untruncated tool input and tool result — pi-agent's `execute` callback receives the untruncated value, and the LLM's `toolResult` message in the conversation is untruncated. The truncation is purely a UI/log concern.

Both events are **ephemeral** (NATS core pub/sub). They are **observer-only** — no agent subscribes to them. The TUI and diagnostic tooling consume them.

## AgentBody

`AgentBody` wraps pi-agent's `Agent` class. It owns the EventBus bridge, tool adaptation, memory persistence, and lifecycle coordination.

```typescript
class AgentBody {
  readonly agent_key:          string;          // persistent instance identity: {role}-{N}
  readonly soul:               AgentSoul;       // immutable after construction
  readonly is_leader:          boolean;         // true if this role is the TEAM.md leader

  private agent:   Agent;                       // pi-agent-core's Agent instance
  private bus:     EventBus;
  private artifacts: ArtifactStore;
  private memory:  MemoryManager;               // see 08-memory.md

  start(): void {}    // subscribes to soul.subscriptions on bus, publishes initial agent.idle, begins event loop
  stop(): void {}     // unsubscribes, shuts down cleanly
}
```

- No inheritance. `AgentBody` is the only concrete class.
- Soul is immutable. An agent's role cannot change at runtime.
- pi-agent's `Agent` handles the LLM loop, tool execution, streaming, and compaction.
- The body is the **only** publisher of events on Jie's bus. The LLM expresses publication intent through `notify`; the body validates and executes the publish.
- **`start()` ordering.** Subscriptions register first (to `{agent_key}` plus `leader.prompt` for the leader, plus `soul.subscriptions` for declared topics), then the body publishes one `agent.idle` to advertise "this agent exists, currently idle" to observers, then the body begins processing the message queue. The startup `agent.idle` is published *after* subscriptions to ensure the body is in a consistent state before observers see it. See `03-event-system.md` "Agent Idle".

### Event Loop

Agents wake up on a prompt — either a user prompt (leader via `leader.prompt`) or a topic notification from another agent (via `notify` to a topic the agent subscribes to).

While running:

1. Receive a message on a subscribed subject (e.g. `leader.prompt` or a domain topic like `task.recorded`).
2. If currently processing a prior message, the incoming message waits until the agent is idle.
3. When idle, pick up the next message and process it.

Processing a prompt = one LLM-driven loop managed by pi-agent's `Agent`. The loop runs (think → optionally call tools → think → ...) until the LLM's `stopReason` is `"stop"`, `"length"`, `"error"`, or `"aborted"`. The LLM calls `notify(topic, prompt)` when the system prompt instructs it to — `notify` is a regular tool, not a loop-control mechanism. See pi-agent Integration Contract for loop termination details.

### Concurrency Model

Agents are independent — they process their own message queue serially. Pipeline seriality (one agent at a time) is enforced by the team blueprint's topic subscription graph: each role subscribes to the previous role's topic, so under normal operation only one agent processes at a time per task.

The leader enforces a single-task-in-flight invariant via its system prompt — it does not emit `task.recorded` for a new task while a previous task is active. This is team-defined behavior, not a platform mechanism.

### Failure Handling

Agents resolve errors using LLM reasoning; they are not crash-and-restart components. Tool errors are returned to the LLM as tool-result messages in the same conversation; the LLM may try a different approach.

**Loop termination.** pi-agent's loop terminates when the LLM returns `stopReason: "stop"` (natural end), `"length"` (token limit), `"error"`, or `"aborted"`. Jie does not add its own termination logic on top of pi-agent's loop. `ToolResult.terminate` is a pi-agent mechanism — if a tool returns `terminate: true`, pi-agent stops executing remaining tools in the batch and exits the inner loop. Jie tools may set `terminate: true` but this is pi-agent's concern, not Jie's.

**MCP server crash mid-session.** If an MCP server becomes unreachable while a tool call is in flight, the in-flight call times out (per the default 120s timeout) or returns `mcp_server_unreachable`. The error surfaces to the LLM as a tool-result error — the agent handles it like any other tool error and may retry or degrade gracefully. No process exit. Subsequent MCP calls to the same server return errors until the server is reconnected.

**Bus disconnect.** The in-process `EventBus` cannot disconnect (it's a local data structure). When the process exits, the process exits; the user re-runs `jie`.

## ExecutionContext

Passed to every tool call. Provides identifiers and storage; **does not** expose the event bus.

```typescript
interface ExecutionContext {
  session_id:  string;        // per-process-run identifier; shared across agents in the same process
  team_id:     string;        // resolved team id (from `defaultTeam` resolution); namespace for memory and storage
  agent_key:   string;        // persistent instance identity: {role}-{N}
  agent_role:  string;
  artifacts:   ArtifactStore;
}

## pi-agent Integration Contract

`AgentBody` wraps pi-agent's `Agent` class. This section defines the exact interface boundary: what Jie provides to pi-agent, what pi-agent provides to Jie, and how events flow between them. For the full pi-agent API surface, see `pi-agent-api-reference.md`.

### Agent Construction

At `AgentBody` construction, Jie instantiates pi-agent's `Agent` with the following `AgentOptions`:

| Option | Jie provides |
|---|---|
| `sessionId` | Jie's `session_id` (per-process-run ULID via `ulid@2.3.0`, 26 chars — see `monorepo-structure.md` runtime deps) |
| `getApiKey(provider)` | Resolves via pi-ai's `getEnvApiKey(provider)` — same env vars as `10-configuration.md` |
| `tools` | Set via `agent.state.tools` after construction (see Tool Adaptation below) |
| `systemPrompt` | Set via `agent.state.systemPrompt` — `AgentSoul.system_prompt` |
| `model` | Set via `agent.state.model` — resolved from soul's `model` string via pi-ai's `getModel(provider, modelId)` |
| `beforeToolCall` | Emits `agent.tool.call` on Jie's EventBus. Jie does not use the hook to block execution — the event is published for telemetry, then pi-agent proceeds with tool execution normally. Per pi-agent-core@0.79.1's contract (`pi-agent-api-reference.md`), `beforeToolCall` *can* return `{ block?, reason? }` to block the call or abort the batch, but Jie's implementation does not exercise that path in v1. |
| `afterToolCall` | Emits `agent.tool.result` on Jie's EventBus |
| `transformContext` | The body passes a **wrapped** `transformContext` to pi-agent. The wrapper calls the inner `transformContext` (identity in v1; Day 2+ compaction logic when enabled), diffs input vs. output arrays for newly-added `CompactionSummaryMessage` entries, and calls `memory.compact(range, summary, agent_key, session_id, team_id)` for each. Returns the new array unchanged. See `08-memory.md` "Integration with pi-agent" for the full contract. |
| `convertToLlm` | pi-agent's default — converts `AgentMessage[]` to LLM `Message[]`, filtering non-LLM messages |
| `prepareNextTurn` | — (not wired in v1; prompt injection uses `agent.prompt()` from the body's queue — see "Prompt Ingress & Queuing" below) |
| `compactionSettings` | `CompactionSettings { enabled: false, reserveTokens: 16384, keepRecentTokens: 20000 }` (compaction deferred to Day 2) |
| `steeringMode` | Always `"all"` in v1 |
| `toolExecution` | Always `"sequential"` in v1 |

After construction, Jie sets `agent.state.tools` to the adapted `AgentTool[]`. Jie does NOT set `thinkingLevel` — agents use the model default unless the agent `.md` specifies otherwise (Day 2).

### Tool Adaptation

At construction time, each Jie `Tool` from `AgentSoul.tools` is wrapped into pi-agent's `AgentTool`:

| pi-agent `AgentTool` field | Adaptation |
|---|---|
| `name`, `description`, `label` | Copied directly from Jie `Tool` |
| `parameters` | Jie `Tool.parameters` (TypeBox `TSchema`), passed directly |
| `prepareArguments(raw)` | `TypeBox.Value.Check(parameters, raw)` — validates the LLM-supplied args against the TypeBox schema. Throws when the check returns `false`; pi-agent surfaces the throw as a tool error to the LLM. **No coercion in v1** — `Value.Create` / `Value.Default` are not used; the LLM's args must already match the schema. (TypeBox's current API is `Value.Check`; older `Create` / `Validate` are deprecated.) |
| `execute(toolCallId, params, signal?, onUpdate?)` | Combines `signal` with `AbortSignal.timeout(tool.timeout ?? 120_000)`: if pi-agent provides a signal, uses `AbortSignal.any([piSignal, AbortSignal.timeout(timeout)])`; if pi-agent signal is undefined, uses `AbortSignal.timeout(timeout)` alone. Calls `tool.execute(params, ctx, combinedSignal)`. Wraps return value: `{ content: [{ type: "text", text: result.content }], details: result.details, terminate: result.terminate ?? false }`. On throw (including `AbortError`), re-throws; pi-agent marks the result as `isError`. |
| `executionMode` | Always `"sequential"` |

`ExecutionContext` is closed over at adaptation time — `session_id`, `team_id`, `agent_key`, `agent_role`, and `artifacts` are bound once. Tools never receive different execution contexts within the same agent's lifetime.

### Event Bridging

pi-agent emits events via `agent.subscribe(listener)`. Jie subscribes to these and bridges them to its EventBus:

| pi-agent event | Jie EventBus subject | Notes |
|---|---|---|
| `agent_start` | — | Internal lifecycle; not published |
| `agent_end({ messages })` | — | Marks LLM loop completion; body then publishes `agent.idle`. Compaction detection is **not** in this listener — the body's `transformContext` wrapper owns that (see `08-memory.md` "Integration with pi-agent"). |
| `message_end({ message })` | — | Triggers `memory.persist(message, agent_key, session_id, team_id)` — unconditional, no role check. pi-agent does not emit `message_end` for `CompactionSummaryMessage` injected by `transformContext`; that path is owned by the body's `transformContext` wrapper (see `08-memory.md`). |
| `message_update({ message, assistantMessageEvent })` | `agent.stream.chunk` | Buffered: flush at 64 chars or 200ms (see below) |
| `message_start({ message })` | — | Streaming bookkeeping; no bus event |
| `turn_start` | `agent.turn.start` | Bridged to the bus on every pi-agent `turn_start`. Used by `-p` mode to detect "all agents idle" (paired with `agent.idle`). Empty payload `{}`; the envelope carries `agent_role` and `agent_key`. |
| `turn_end({ message, toolResults })` | — | Turn bookkeeping. pi-agent decides loop continuation based on `message.stopReason` and `ToolResult.terminate`. |
| `tool_execution_start` | — | Deferred to Day 2 (currently `beforeToolCall` covers this) |
| `tool_execution_end` | — | Deferred to Day 2 (currently `afterToolCall` covers this) |

Jie uses `turn_end` for turn bookkeeping only. Loop continuation is pi-agent's responsibility: it checks `message.stopReason` (if `"toolUse"`, loop continues; otherwise exits) and `ToolResult.terminate` (if all tools in batch returned `terminate: true`, loop exits).

### Streaming Pipeline

pi-agent emits `message_update` on every token delta (text/thinking/tool_call content). Jie buffers these:

1. On first `message_update` of a new stream, allocate a new buffer, `stream_id` (per-LLM-invocation counter), and start a flush timer (`setTimeout`, `stream_flush_ms` default 200ms).
2. Append delta text to the buffer.
3. Flush when: buffer length ≥ `stream_chunk_size` (default 64 chars), or the flush timer fires (200ms since first buffered char). On flush, publish `agent.stream.chunk` with `{ stream_id, seq, text }`, reset the buffer, and clear the timer.
4. On `message_end` (assistant response complete), clear the timer, flush remaining buffer as final chunk, and publish `agent.stream.end` with `{ stream_id, total_chunks }`.

Streaming events are published on Jie's EventBus; the TUI and `-p` mode consume them.

### Prompt Ingress & Queuing

When a message arrives on Jie's EventBus (via `leader.prompt` or a topic subscription), the body formats it as a synthetic `user` `AgentMessage` and ingests via `agent.prompt()`:

| Source subject | Synthetic `user` message `content` |
|---|---|
| `leader.prompt` (no `source`; from TUI / `-p` mode) | ``[user]: {prompt}`` |
| Domain topic / direct addressing (from `notify`) | ``[{source_agent_key} on '{topic}']: {prompt}`` |

Both formats are plain text — v1 has no image / multimodal content for synthetic user messages. `content` is always a single `string` (see `M8` in `review-tracker.md`). The body converts the payload's `prompt` field verbatim; no escaping, no parsing of inner newlines, no parsing of the recipient's intent. The receiving LLM extracts identifiers, topic names, and structure from the text as part of its reasoning.

Ingress flow:

1. If idle — calls `agent.prompt(syntheticMessage)`.
2. If busy — queues the synthetic message in `AgentBody`'s in-memory queue. After `agent_end`, the body dequeues and calls `agent.prompt(nextMessage)`.

The queue is FIFO, in-memory only (not persisted). Lost on restart. See `08-memory.md` Leader Agent Working Memory.

**Queue observability.** The body publishes `agent.queue.update` on every enqueue and every dequeue, mirroring pi's `queue_update` event. The payload is `{ prompts: string[] }` — the current snapshot of the queue. Each element of `prompts` is the synthetic `user`-message format the body would feed to `agent.prompt()`: ``[user]: {prompt}`` for `leader.prompt` and ``[{source_agent_key} on '{topic}']: {prompt}`` for `notify`-sourced prompts (see "Prompt Ingress & Queuing" above). The TUI subscribes to this event to render the queued-prompt indicator (e.g., "3 prompts queued") and a peek of the contents. Without this event, the TUI would have to derive queue state from "leader is not idle", which is brittle when multiple agents are active.

> **v1 has no cap** on this queue (it is intentionally unbounded, matching pi-agent's `followUpQueue` / `steeringQueue` behavior). A backlog item exists to revisit cap value, drop policy, and observability — see `backlog.md` #19.

### Memory Persistence

Memory has two write paths in the body, both unconditional:

- **`message_end` → `persist`**: On every `message_end` from pi-agent, the body calls `memory.persist(message, agent_key, session_id, team_id)` — write-through to SQLite. No role check; the listener does not special-case summaries.
- **`transformContext` wrapper → `compact`**: The body passes a wrapped `transformContext` to pi-agent. The wrapper calls the inner `transformContext`, diffs input vs. output for newly-added `CompactionSummaryMessage` entries, and calls `memory.compact(range, summary, agent_key, session_id, team_id)` for each. The wrapper is invariant across days: in v1 the inner is identity (no compaction → wrapper is a no-op); in Day 2+ the inner is pi-agent's actual compaction logic (or a custom implementation) and the wrapper persists the produced summaries. Compaction is trigger-agnostic — `/compact` slash command, pi-agent's auto-threshold, or Day 2+ team hooks all funnel through `transformContext` and the wrapper persists.

Memory is durable but session-scoped: a new process run gets a new `session_id`, so agents start with clean conversations each time. Memory restore is used only for debugging or future compaction-aware replay.

`memory.compact()` writes the summary row and the raw range's `compacted=1` flag updates in a single `Storage.transaction()`. The `compactionSummary` role's row is owned exclusively by `compact()`; `persist()` does not write summaries because pi-agent does not emit `message_end` for `CompactionSummaryMessage` injected by `transformContext`. See `08-memory.md` "Compact" and "Integration with pi-agent" for the full contract.

### Loop Termination

pi-agent's `Agent` loop terminates based on the LLM's `stopReason` field on `AssistantMessage`:
- `"stop"` — LLM finished naturally (no more to say, no tool calls). Loop exits.
- `"length"` — LLM hit max output tokens. Loop exits.
- `"toolUse"` — LLM requested tool calls. Loop continues after tool execution.
- `"error"` / `"aborted"` — API error or abort. Loop exits immediately.

Jie does not add grace turns or platform-level termination logic. The LLM is trusted to call `notify` per its system prompt. `ToolResult.terminate` is pi-agent's mechanism for a tool to signal "stop after this batch" — it is not Jie's concern.
```

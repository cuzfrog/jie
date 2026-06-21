# Field Naming

Code identifiers (variables, parameters, class fields, function names) use camelCase. Names must be full words, no abbreviations beyond common ones (`id`, `url`, `db`, `ts` are OK).

Exception for wire-bound shapes: a type, interface, or shape whose JSON serialization is part of a stable contract may use snake_case fields that match the wire form. The exception is conscious, not drift. A field is wire-bound only if at least one of these is true:

- It appears in an `AgentEvent` envelope that is persisted or emitted on the public event bus.
- It is a column in the `artifacts` or `memory_turns` tables.
- It is the input/output shape of a tool documented in `packages/jie-platform/tools/MODULE.md`.
- It is a parameter on a `MemoryManager` method, since those parameters map directly to persisted columns.

When converting at the wire boundary, the producing code reads camelCase internals and produces a snake_case wire object. The reverse holds on the consumer side.

Examples that ARE wire-bound (snake_case OK):

- `AgentEvent.team_id, agent_role, agent_key, event_type, created_at`.
- `ArtifactStore.{ key, content, created_at }`.
- `MemoryManager.persist(message, agent_key, session_id, team_id)` parameter names.

Examples that are NOT wire-bound (camelCase required):

- A `const isLeader = ...` local in `start.ts`, even if a few lines below it is assigned into `isLeader: isLeader`. The local is internal; the camelCase field exists.
- Internal class fields that mirror wire fields but are read only inside the class.
- `function resolveSessionId(...)`: the local `teamId` parameter is camelCase even though it is used to construct a snake_case `team_id` value at the wire boundary.

When in doubt: if the identifier does not appear (1) in a JSON object that crosses a process or storage boundary, or (2) as a SQL column name, it is not wire-bound.

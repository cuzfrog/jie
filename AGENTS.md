# Context Rules

- IMPORTANT: adhere to Code Conventions and Coding Principles

## Design Principles
- Constraints liberate, liberties constrain.
- LLM(agents) only talk to tools and receive prompts

## Architecture
- @doc/specs/monorepo-structure.md
- read `00-overview.md` in the dir you will work with to understand the glossary.
- architectural decision records are in `doc/addrs/`. Each ADR is the source of truth for a consequential decision; the spec docs reflect the decisions.
- @doc/DEVELOPMENT.md
- @doc/plan/MILESTONES.md

### jie-platform
- agents do not directly know each other, they talk via events on an event bus.
- a CLI and a TUI
- provide an interface for `team-blueprint`, but agnostic of `jie-team` or any other team shape
- allow for configuring MCP servers; pluggable tool implementations; provide tool resolution
- storage interface for: context and memory management ; generic business agnostic artifacts
- agnostic of jie-team or code-lens
- depends on `@earendil-works/pi-agent-core`, API Reference in `jie-platform/pi-agent-api-reference.md`. We should follow pi conventions and reuse what it provides. Given a general question, check how does pi solve it.

### jie-team
- the `team-blueprint` to build an agentic workflow to run on top of jie-platform
- a framework for custom team building
- provide a built-in team-blueprint with predefined workflow for software development
- provide a simplest `team-blueprint` with 1 leader `general` agent with default tools

### code-lens
- a standalone mcp server to provide code architectural information without the need to dive into the code.

## Document rules
- Keep your writing short and concise but accurate enough to avoid guessing room.
- Do not keep intermediate, transient history in md files under `specs/`, they are the update-to-date blueprint for the project.
- Do not record what you've done if the information is not helpful to make subsequent decisions.
- No emojis in commits, issues, PR comments, or code
- Do not use newline to break sentences. Let IDE wrap text.

## Conversation style
- When I ask a question, answer it before any actions.
- When I make a decision, reason it thoroughly, then express your opinion. Only when we both agree, we move on.
- Stick to fact. Our purpose is to build a good software, don't fluff, challenge my ideas.
- Directly ask questions without calling ask_user tool, there's no such a tool.
- Do not ask trivial questions that have no consequences.

## Code Conventions

- No `any` types, No enums, No inline imports (all imports must be at the top).
- Use interfaces for OOP abstractions.
- Use only erasable TypeScript syntax compatible with Node strip-only mode in TypeScript. Do not use constructor parameter properties, `enum`, `namespace`/`module`, `import =`, `export =`, or other TypeScript constructs that require JavaScript emit. Use explicit fields and constructor assignments instead of parameter properties.
- Public types, contract, methods, higher-level abstractions should be at the top of the files, private implementation details should be at the bottom. If a private function only is used in the same file, it should be below its callers. See below section `Single file layout`.
- Avoid trivial functions, inline them.
- Imports from a module without specific file, e,g, `import { foo } from "../module"`. Not `"../module/index.ts"`. For siblings in the immediate directory, directly import from the sibling, e.g. `import { foo } from "./foo"`.
- Code identifiers (variables, parameters, class fields, function names) use camelCase. Names must be full words, no abbreviations beyond common ones (`id`, `url`, `db`, `ts`). Only serialized events/messages use snake_case.
- Keep code in one line if the row is < 140 chars. Do not break into multiple lines if the row is < 140 chars.

### Test
- use mocks for unit test. See @doc/HOW_TO_MOCK.md
- tests should align with the test target file. E.g. a test `function1.test.ts` should test and only test `function1.ts`. If `function1.test.ts` is testing `index.ts`, it a smell of coding principle violation. Unit tests should not test dependencies.
- do not import `bun:test`, all test utilities have been added to global namespace and is compatible with `vi`.

### Single file layout (ordered from top to bottom)
1. imports
2. domain types
3. 1 public interface
4. constructor method
5. concrete implementation
6. private functions (at bottom)

### Git
- When involving git operations, refer to @doc/AGENTS_GIT.md.
- Do not use `gh`. use `./scripts/gh-bot.mjs` so you will have your identity `abao-bot`

### Coding Principles
- Read files in full before making wide-ranging changes, before editing files you have not already fully inspected, and when the user asks you to investigate or audit something. Do not rely only on search snippets for broad changes. Given a change, do not first attempt to insert into current code base. First look at it from a higher perspective, discover refactor opportunities.
- Check node_modules for external API type definitions instead of guessing
- NEVER remove or downgrade code to fix type errors from outdated dependencies; upgrade the dependency instead
- Naming must reflect the abstraction level. If a newly introduced function violates this, considering renaming the existing function to maintain correct abstraction levels.
- Avoid "helper" functions, they are where code is coupled out of class hierarchy. "helper" functions are functions that are outside the abstraction hierarchy, containing domain logic, serving the only purpose of code reuse. They are different from "utility/support" functions that are purely technical without complex domain logic. Utility functions do not have a position in the abstraction hierarchy.
- A function's parameters should be data it consumes, parameters should not be its dependencies. A high-order function should only be used for transformation instead of procedural processing. Context and config types are exempted from this rule.
- A responsibility should belong to an earlier performer. E.g. if type `Config` can parse the configuration into ready-to-use types, it shouldn't pass raw strings to its clients. A producer should produce the best output for its consumers.
- A module should be easily testable with mocked dependencies. Unit tests should be done with mocks without creating actual dependency or causing any side effects.
- Logic should be put in pure functions as much as possible. Any side effects, e.g. IO, should be at the edge layers with minimal logic. This makes the code easier to test.
- Only features are scoped, NO compromize on NFR.

#### Module visibility
Minimal visibility or public surface of a type or a module. This ensures loose coupling and separation of concerns. If this is violated, e.g. a type or a module exposes multiple functions, it usually means the design is wrong.
- A module should only have 1 interface and its constructor method that are public. All other implementations should not be exposed.
- For a single file module, all other things in the file should be file private. For unit testing complex logic, re-export them at the file bottom with `_` prefix to the function, meaning only "visible for testing".
- All imports must be from a module (without explicit `index.ts`), must NOT import from a specific file. For the same file, only use one import statement.
- In each module, search `MODULE.md` for its api, responsibilities, and files layout. You must follow its specifications. You cannot change the visibility. You should not modify this file. You cannot add any other public types/functions. Any changes must be discussed with me. If you are blocked, ask me to review and manually add the exports. `frozen` means no new exports, it does not mean the file cannot be edited.
- Cross boundary domain types, config types, DTOs are exempted from the visibility rule.

#### SOLID principles:
- **Single Responsibility Principle**: A function, class, or module should have one, and only one, reason to change.
- **Open/Closed Principle**: Hide implementations behind interfaces. So that modifications happen without the client code needing to know.
- **Liskov Substitution Principle**: Switching implementation should not violate the interface's contract, including implicit ones like side effects and error handling.
- **Interface Segregation Principle**: A client should not be forced to depend on interfaces it does not use.
- **Dependency Inversion Principle**: High-level modules should not depend on low-level modules. Abstractions should not depend on detailed implementations.

## Things to avoid
- do not `find` from the root dir, it's slow and unnecessary. Use `pwd` to figure out where you are.
- do not assume a tool is available unless you are told, search before calling if you are not sure.
- do not write test-only production code, testability should be achieved by adhering to above coding principles.
- do not shorten variables, function names. E.g. use `agentEvent` for type `AgentEvent` instead of `event` or `env` to avoid confusion.
- do not add comments unless the code itself cannot tell, decisions should be captured in docs or addrs.

## Best practices
- write down your plan before execution.
- when you have multiple steps in your execution, use a todo-list to track your tasks.

(you can write tmp files to `./tmp/`, which is ephemeral)

## File Edit Checklist
Pre-action:
- Before adding utility functions/logic, check existing utils for reuse.
- Before adding logic to existing files, check if any coding principles are violated, if violated, propose refactoring first.

Post-action:
- After file edit (semantic or logic change), run tests.

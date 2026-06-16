# Context Rules

- Only features are scoped, NO compromize to NFR.

## Design Principles
- Constraints liberate, liberties constrain.
- LLM(agents) only talk to tools and receive prompts

## Architecture
- @doc/specs/monorepo-structure.md
- read `00-overview.md` in the dir you will work with to understand the glossary.
- architectural decision records are in `doc/addrs/`. Each ADR is the source of truth for a consequential decision; the spec docs reflect the decisions.

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

## Conversation style
- When I ask a question, answer it before any actions.
- When I make a decision, reason it thoroughly, then express your opinion. Only when we both agree, we move on.
- Stick to fact. Our purpose is to build a good software, don't fluff, challenge my ideas.

## Code Conventions

- No `any` types, No enums, No inline imports, No Classes
- Use only erasable TypeScript syntax compatible with Node strip-only mode in TypeScript. Do not use constructor parameter properties, `enum`, `namespace`/`module`, `import =`, `export =`, or other TypeScript constructs that require JavaScript emit. Use explicit fields and constructor assignments instead of parameter properties.
- Public types, contract, methods, higher-level abstractions should be at the top of the files, private implementation details should be at the bottom. If a private function only is used in the same file, it should be below its callers. See below section `Single file layout`.
- Do not add comments except it's a consequential information and the code itself cannot tell.

### Test
- use mocks for unit test. A file `my-function.ts`'s test file `my-function.test.ts` should only test `my-function.ts`.

### Single file layout (ordered from top to bottom)
1. imports
2. domain types
3. 1 public interface
4. constructor method
5. concrete implementation
6. private functions

### Git
- When involving git operations, refer to @doc/AGENTS_GIT.md.
- Do not use `gh`. use `./scripts/gh-bot.mjs` so you will have your identity `abao-bot`

## Coding Principles
- Read files in full before making wide-ranging changes, before editing files you have not already fully inspected, and when the user asks you to investigate or audit something. Do not rely only on search snippets for broad changes. Given a change, do not first attempt to insert into current code base. First look at it from a higher perspective, discover refactor opportunities.
- Check node_modules for external API type definitions instead of guessing
- NEVER remove or downgrade code to fix type errors from outdated dependencies; upgrade the dependency instead
- Naming must reflect the abstraction level. If a newly introduced function violates this, considering renaming the existing function to maintain correct abstraction levels.
- Avoid "helper" functions, they are where code is coupled out of class hierarchy. "helper" functions are functions that are outside the abstraction hierarchy, containing domain logic, serving the only purpose of code reuse. They are different from "utility/support" functions that are purely technical without complex domain logic. Utility functions do not have a position in the abstraction hierarchy.
- A function's parameters should be data it consumes, parameters should not be its dependencies. A high-order function should only be used for transformation instead of procedural processing. Context and config types are exempted from this rule.
- A responsibility should belong to an earlier performer. E.g. if type `Config` can parse the configuration into ready-to-use types, it shouldn't pass raw strings to its clients. A producer should produce the best output for its consumers.
- A module should be easily testable with mocked dependencies. Unit tests should be done with mocks without creating actual dependency or causing any side effects.
- Logic should be put in pure functions as much as possible. Any side effects, e.g. IO, should be at the edge layers with minimal logic. This makes the code easier to test.

### SOLID principles:
- **Single Responsibility Principle**: A function, class, or module should have one, and only one, reason to change.
- **Open/Closed Principle**: Hide implementations behind interfaces. So that modifications happen without the client code needing to know.
- **Liskov Substitution Principle**: Switching implementation should not violate the interface's contract, including implicit ones like side effects and error handling.
- **Interface Segregation Principle**: A client should not be forced to depend on interfaces it does not use.
- **Dependency Inversion Principle**: High-level modules should not depend on low-level modules. Abstractions should not depend on detailed implementations.

## Things to avoid
- do not `find` from the root dir, it's slow and unnecessary. Use `pwd` to figure out where you are.
- do not assume a tool is available unless you are told, search before calling if you are not sure.

## File Edit Checklist
Pre-action:
- Before adding utility functions/logic, check existing utils for reuse.
- Before adding logic to existing files, check if the abstraction level is correct, if not propose refactoring first.

Post-action:
- After file edit (semantic or logic change), run tests.

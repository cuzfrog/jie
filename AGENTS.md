# Context Rules

- Current stage is design and review Day 1 features. No actual implementation.
- Only features are scoped, NO compromize to NFR.
- Our goal is to hammer our specs to build a runnable, deployable, usable application.


## Design Principles
- Constraints liberate, liberties constrain.
- LLM(agents) only talk to tools and receive prompts

## Architecture
- @specs/monorepo-structure.md
- read `00-overview.md` in the dir you will work with to understand the glossary.
- architectural decision records are in `./addrs/`. Each ADR is the source of truth for a consequential decision; the spec docs reflect the decisions.

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
- Keep your writing concise but accurate enough to avoid guessing room.
- Do not keep intermediate, transient history in md files under `specs/`, they are the update-to-date blueprint for the project.
- Do not record what you've done if the information is not helpful to make subsequent decisions.

## Conversation style
- When I ask a question, answer it before any actions.
- When I make a decision, reason it thoroughly, then express your opinion. Only when we both agree, we move on.
- Stick to fact. Our purpose is to build a good software, don't fluff, challenge my ideas.

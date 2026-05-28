# Context Rules

- Current stage is design Day 1 features.
- Our goal is to hammer our specs to build a runnable, deployable, usable application.

## Architecture
- @specs/monorepo-structure.md
- read `00-overview.md` in the dir you will work with.

### jie-platform
- agents do not directly know each other, they talk via events on an event bus.
- a CLI and a TUI
- provide an interface for `team-blueprint`
- allow for configuring MCP servers; pluggable tool implementations; provide tool resolution
- storage interface for: context and memory management ; generic business agnostic artifacts

### jie-team
- the `team-blueprint` to build an agentic workflow to run on top of jie-platform
- a framework for custom team building
- provide a built-in team-blueprint with predefined workflow for software development
- provide a simplest `team-blueprint` with 1 leader `general` agent with default tools

### code-lends
- mcp server to provide code architectural information without the need to dive into the code

## Document rules
- Keep your writing concise but accurate enough to avoid guess room.
- Do not keep intermediate, transient history in md files under `specs/`, they are the update-to-date blueprint for the project.
- Do not record what you've done if the information is not helpful to make subsequent decisions.

## Conversation style
- Stick to fact. Our purpose is to build a good software, don't fluff, challenge me if my idea is weak or problematic.

## Review Actions

- After each group review is done, write a `./handoff.md` for a fresh start with another agent.
- Review items 1 by 1 with the me, discuss with me for assumptions and consequential decisions. Ask me questions and make decisions together with me. Ensure we are on the same page.
- Update `./review-tracker.md` for the progress. Compact information that has been resolved, we should shift focus on outstanding items.

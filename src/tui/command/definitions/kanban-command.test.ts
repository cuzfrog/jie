import type { KanbanCard } from "../../../platform";
import { makeTuiState } from "../../test";
import { KanbanCommand } from "./kanban-command";
import { makePlatform, teamState } from "./_test-fixture";

const SAMPLE_BOARD: ReadonlyArray<KanbanCard> = [
  { id: "#1", content: "first task", status: "in_review" },
  { id: "#2", content: "second task", status: "completed" },
  { id: "#3", content: "third task", status: "pending" },
];

describe("KanbanCommand", () => {
  const command = new KanbanCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("kanban");
    expect(command.meta.description).toBe("toggle the kanban panel");
    expect(command.meta.argumentHint).toBe("<add|remove|complete|review|handoff>");
  });

  test("resolve with no subcommand cycles the kanban view", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, [])).toEqual({ kind: "ui", action: "cycleKanbanView" });
  });

  test("resolve add parses flags and builds the kanbanAdd command", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, ["add", "--title", "title", "do the thing"])).toEqual({
      kind: "platform",
      slashName: "kanban add",
      command: { name: "kanbanAdd", teamId: "t1", title: "title", description: "do the thing" },
    });
  });

  test("resolve add with --ephemeral sets the session scope", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, ["add", "--ephemeral", "task"])).toEqual({
      kind: "platform",
      slashName: "kanban add",
      command: { name: "kanbanAdd", teamId: "t1", description: "task", scope: "session" },
    });
  });

  test("resolve add without a description reports usage", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, ["add"])).toEqual({ kind: "error", text: "/kanban add [--ephemeral] [--title <title>] <description>" });
  });

  test("resolve remove requires a card id", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, ["remove"])).toEqual({ kind: "error", text: "/kanban remove <cardId>" });
  });

  test("resolve remove builds the kanbanRemove command", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, ["remove", "#1"])).toEqual({
      kind: "platform",
      slashName: "kanban remove",
      command: { name: "kanbanRemove", teamId: "t1", cardId: "#1" },
    });
  });

  test("resolve complete builds the kanbanSetStatus completed command", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, ["complete", "#1"])).toEqual({
      kind: "platform",
      slashName: "kanban complete",
      command: { name: "kanbanSetStatus", teamId: "t1", cardId: "#1", status: "completed" },
    });
  });

  test("resolve review builds the kanbanSetStatus in_review command", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, ["review", "#1"])).toEqual({
      kind: "platform",
      slashName: "kanban review",
      command: { name: "kanbanSetStatus", teamId: "t1", cardId: "#1", status: "in_review" },
    });
  });

  test("resolve handoff requires a card id and a target team", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, ["handoff", "#1"])).toEqual({
      kind: "error",
      text: "/kanban handoff [<teamId>/]<cardId> <targetTeamId>",
    });
  });

  test("resolve handoff builds the kanbanHandoff command", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, ["handoff", "#1", "other-team"])).toEqual({
      kind: "platform",
      slashName: "kanban handoff",
      command: { name: "kanbanHandoff", teamId: "t1", cardId: "#1", targetTeamId: "other-team" },
    });
  });

  test("resolve reports an unknown subcommand", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, ["unknown"])).toEqual({ kind: "error", text: "/kanban: unknown subcommand 'unknown'" });
  });

  test("resolve add requires a loaded team", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["add", "task"])).toEqual({ kind: "error", text: "/kanban: no team loaded" });
  });

  test("complete returns subcommands", async () => {
    const context = { state: makeTuiState({ kanbanBoard: SAMPLE_BOARD }), platform: makePlatform() };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [
        { value: "add", label: "add", description: "[--title <title>] <description>" },
        { value: "remove", label: "remove", description: "<cardId>" },
        { value: "complete", label: "complete", description: "<cardId>" },
        { value: "review", label: "review", description: "<cardId>" },
        { value: "handoff", label: "handoff", description: "[<teamId>/]<cardId> <targetTeamId>" },
      ],
    });
  });

  test("complete filters subcommands by prefix", async () => {
    const context = { state: makeTuiState({ kanbanBoard: SAMPLE_BOARD }), platform: makePlatform() };
    const result = await command.complete("c", context);
    expect(result).toEqual({
      items: [{ value: "complete", label: "complete", description: "<cardId>" }],
    });
  });

  test("complete remove returns all non-matching card ids", async () => {
    const context = { state: makeTuiState({ kanbanBoard: SAMPLE_BOARD }), platform: makePlatform() };
    const result = await command.complete("remove ", context);
    expect(result).toEqual({
      items: [
        { value: "remove #1", label: "#1", description: "first task" },
        { value: "remove #2", label: "#2", description: "second task" },
        { value: "remove #3", label: "#3", description: "third task" },
      ],
    });
  });

  test("complete complete filters out already-completed cards", async () => {
    const context = { state: makeTuiState({ kanbanBoard: SAMPLE_BOARD }), platform: makePlatform() };
    const result = await command.complete("complete ", context);
    expect(result).toEqual({
      items: [
        { value: "complete #1", label: "#1", description: "first task" },
        { value: "complete #3", label: "#3", description: "third task" },
      ],
    });
  });

  test("complete review filters out already-in-review cards", async () => {
    const context = { state: makeTuiState({ kanbanBoard: SAMPLE_BOARD }), platform: makePlatform() };
    const result = await command.complete("review ", context);
    expect(result).toEqual({
      items: [
        { value: "review #2", label: "#2", description: "second task" },
        { value: "review #3", label: "#3", description: "third task" },
      ],
    });
  });

  test("complete add returns null", async () => {
    const context = { state: makeTuiState({ kanbanBoard: SAMPLE_BOARD }), platform: makePlatform() };
    expect(await command.complete("add ", context)).toBe(null);
  });
});

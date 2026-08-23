import type { KanbanCard } from "../../../platform";
import { makePlatform, makeTuiState, teamState } from "../../test";
import { KanbanCommand } from "./kanban-command";

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
    expect(command.meta.argumentHint).toBe("<add|clear|remove|complete|review|handoff|toggle>");
  });

  test("resolve with no subcommand cycles the kanban view", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, [])).toEqual({ kind: "ui", action: "cycleKanbanView" });
  });

  test("resolve add parses flags and builds the kanbanAdd command", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["add", "--title", "title", "do the thing"])).toEqual({
      kind: "platform",
      slashName: "kanban add",
      command: { name: "kanbanAdd", teamId: "t1", title: "title", description: "do the thing" },
    });
  });

  test("resolve add with --team and --title sets both scope and title", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["add", "--team", "--title", "T", "desc"])).toEqual({
      kind: "platform",
      slashName: "kanban add",
      command: { name: "kanbanAdd", teamId: "t1", title: "T", description: "desc", scope: "team" },
    });
  });

  test("resolve add with --team sets the team scope", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["add", "--team", "task"])).toEqual({
      kind: "platform",
      slashName: "kanban add",
      command: { name: "kanbanAdd", teamId: "t1", description: "task", scope: "team" },
    });
  });

  test("resolve add with --ephemeral reports an unknown flag", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["add", "--ephemeral", "task"])).toEqual({
      kind: "error",
      text: "/kanban add: unknown flag '--ephemeral'",
    });
  });

  test("resolve add without a description reports usage", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["add"])).toEqual({ kind: "error", text: "/kanban add [--team] [--title <title>] <description>" });
  });

  test("resolve remove requires a card id", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["remove"])).toEqual({ kind: "error", text: "/kanban remove <cardId>" });
  });

  test("resolve remove builds the kanbanRemove command", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["remove", "#1"])).toEqual({
      kind: "platform",
      slashName: "kanban remove",
      command: { name: "kanbanRemove", teamId: "t1", cardId: "#1" },
    });
  });

  test("resolve complete builds the kanbanSetStatus completed command", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["complete", "#1"])).toEqual({
      kind: "platform",
      slashName: "kanban complete",
      command: { name: "kanbanSetStatus", teamId: "t1", cardId: "#1", status: "completed" },
    });
  });

  test("resolve review builds the kanbanSetStatus in_review command", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["review", "#1"])).toEqual({
      kind: "platform",
      slashName: "kanban review",
      command: { name: "kanbanSetStatus", teamId: "t1", cardId: "#1", status: "in_review" },
    });
  });

  test("resolve handoff requires a card id and a target team", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["handoff", "#1"])).toEqual({
      kind: "error",
      text: "/kanban handoff [<teamId>/]<cardId> <targetTeamId>",
    });
  });

  test("resolve handoff builds the kanbanHandoff command", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["handoff", "#1", "other-team"])).toEqual({
      kind: "platform",
      slashName: "kanban handoff",
      command: { name: "kanbanHandoff", teamId: "t1", cardId: "#1", targetTeamId: "other-team" },
    });
  });

  test("resolve reports an unknown subcommand", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["unknown"])).toEqual({ kind: "error", text: "/kanban: unknown subcommand 'unknown'" });
  });

  test("resolve toggle requires a card id and todo text", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["toggle", "#1"])).toEqual({
      kind: "error",
      text: "/kanban toggle <cardId> <todo text>",
    });
  });

  test("resolve toggle builds the kanbanToggleTodo command with greedy todo text", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["toggle", "#1", "do", "the", "thing"])).toEqual({
      kind: "platform",
      slashName: "kanban toggle",
      command: { name: "kanbanToggleTodo", teamId: "t1", cardId: "#1", todo: "do the thing" },
    });
  });

  test("complete toggle returns only cards with todos", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState({ kanbanBoard: [
      { id: "#1", content: "with todos", status: "in_progress", todos: [{ text: "one", done: false }] },
      { id: "#2", content: "no todos", status: "in_progress" },
    ] }), platform };
    const result = await command.complete("toggle ", context);
    expect(result).toEqual({
      items: [{ value: "toggle #1", label: "#1", description: "with todos" }],
    });
  });

  test("complete toggle returns all matching card ids with todos", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState({ kanbanBoard: [
      { id: "#1", content: "first task", status: "in_review", todos: [{ text: "one", done: false }] },
      { id: "#2", content: "second task", status: "completed", todos: [{ text: "one", done: false }] },
      { id: "#3", content: "third task", status: "pending", todos: [{ text: "one", done: false }] },
    ] }), platform };
    const result = await command.complete("toggle ", context);
    expect(result).toEqual({
      items: [
        { value: "toggle #1", label: "#1", description: "first task" },
        { value: "toggle #2", label: "#2", description: "second task" },
        { value: "toggle #3", label: "#3", description: "third task" },
      ],
    });
  });

  test("resolve clear builds the kanbanClear command", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["clear"])).toEqual({
      kind: "platform",
      slashName: "kanban clear",
      command: { name: "kanbanClear", teamId: "t1" },
    });
  });

  test("resolve clear with --team sets the team scope", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["clear", "--team"])).toEqual({
      kind: "platform",
      slashName: "kanban clear",
      command: { name: "kanbanClear", teamId: "t1", scope: "team" },
    });
  });

  test("resolve clear with extra arguments reports usage", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["clear", "junk"])).toEqual({
      kind: "error",
      text: "/kanban clear [--team]",
    });
  });

  test("resolve add requires a loaded team", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["add", "task"])).toEqual({ kind: "error", text: "/kanban: no team loaded" });
  });

  test("complete returns subcommands", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState({ kanbanBoard: SAMPLE_BOARD }), platform };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [
        { value: "add", label: "add", description: "[--team] [--title <title>] <description>" },
        { value: "clear", label: "clear", description: "remove all cards [--team]" },
        { value: "remove", label: "remove", description: "<cardId>" },
        { value: "complete", label: "complete", description: "<cardId>" },
        { value: "review", label: "review", description: "<cardId>" },
        { value: "handoff", label: "handoff", description: "[<teamId>/]<cardId> <targetTeamId>" },
        { value: "toggle", label: "toggle", description: "<cardId> <todo text>" },
      ],
    });
  });

  test("complete filters subcommands by substring", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState({ kanbanBoard: SAMPLE_BOARD }), platform };
    const result = await command.complete("c", context);
    expect(result).toEqual({
      items: [
        { value: "clear", label: "clear", description: "remove all cards [--team]" },
        { value: "complete", label: "complete", description: "<cardId>" },
      ],
    });
  });

  test("complete remove returns all non-matching card ids", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState({ kanbanBoard: SAMPLE_BOARD }), platform };
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
    const { platform } = makePlatform();
    const context = { state: makeTuiState({ kanbanBoard: SAMPLE_BOARD }), platform };
    const result = await command.complete("complete ", context);
    expect(result).toEqual({
      items: [
        { value: "complete #1", label: "#1", description: "first task" },
        { value: "complete #3", label: "#3", description: "third task" },
      ],
    });
  });

  test("complete review filters out already-in-review cards", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState({ kanbanBoard: SAMPLE_BOARD }), platform };
    const result = await command.complete("review ", context);
    expect(result).toEqual({
      items: [
        { value: "review #2", label: "#2", description: "second task" },
        { value: "review #3", label: "#3", description: "third task" },
      ],
    });
  });

  test("complete remove filters cards by a substring of the card id", async () => {
    const { platform } = makePlatform();
    const board: ReadonlyArray<KanbanCard> = [
      { id: "#12", content: "twelve", status: "pending" },
      { id: "#21", content: "twenty-one", status: "pending" },
      { id: "#33", content: "thirty-three", status: "pending" },
    ];
    const context = { state: makeTuiState({ kanbanBoard: board }), platform };
    const result = await command.complete("remove 1", context);
    expect(result).toEqual({
      items: [
        { value: "remove #12", label: "#12", description: "twelve" },
        { value: "remove #21", label: "#21", description: "twenty-one" },
      ],
    });
  });

  test("complete remove returns all matching card ids beyond 20", async () => {
    const { platform } = makePlatform();
    const board: ReadonlyArray<KanbanCard> = Array.from({ length: 25 }, (_, i) => ({
      id: `#${i + 1}`,
      content: `task ${i + 1}`,
      status: "pending",
    }));
    const context = { state: makeTuiState({ kanbanBoard: board }), platform };
    const result = await command.complete("remove ", context);
    expect(result).not.toBeNull();
    expect(result!.items.length).toBe(25);
  });

  test("complete add returns null", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState({ kanbanBoard: SAMPLE_BOARD }), platform };
    expect(await command.complete("add ", context)).toBe(null);
  });
});

import { render } from "../test-renderer";
import { SlashAutocomplete, SLASH_COMMAND_NAMES } from "./SlashAutocomplete";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

interface MountArgs {
  readonly editorText: string;
  readonly sessionPickerOpen?: boolean;
  readonly commands?: ReadonlyArray<string>;
}

interface MountHandle {
  readonly captured: {
    readonly committed: { readonly command: string; readonly args: string }[];
    readonly lastFrame: () => string | undefined;
    readonly stdin: { write: (data: string) => void };
  };
}

function mount(args: MountArgs): MountHandle {
  const committed: { command: string; args: string }[] = [];
  const out = render(
    <SlashAutocomplete
      editorText={args.editorText}
      sessionPickerOpen={args.sessionPickerOpen ?? false}
      commands={args.commands ?? SLASH_COMMAND_NAMES}
      onCommit={(command, argv): void => {
        committed.push({ command, args: argv });
      }}
    />,
  );
  return {
    captured: {
      committed,
      lastFrame: out.lastFrame,
      stdin: out.stdin,
    },
  };
}

describe("SlashAutocomplete", () => {
  test("renders nothing when editorText is empty", () => {
    const probe = mount({ editorText: "" });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).not.toContain("help");
    expect(frame).not.toContain("clear");
  });

  test("renders all matched commands when editorText starts with `/`", () => {
    const probe = mount({ editorText: "/" });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).toContain("help");
    expect(frame).toContain("clear");
    expect(frame).toContain("exit");
  });

  test("filters commands by prefix", () => {
    const probe = mount({ editorText: "/h" });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).toContain("help");
    expect(frame).not.toContain("clear");
    expect(frame).not.toContain("exit");
  });

  test("renders nothing when no command matches the prefix", () => {
    const probe = mount({ editorText: "/zz" });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame.trim()).toBe("");
  });

  test("Tab commits the focused suggestion when there are multiple candidates", async () => {
    const probe = mount({ editorText: "/" });
    probe.captured.stdin.write("\t");
    await flush();
    expect(probe.captured.committed).toEqual([{ command: "help", args: "" }]);
  });

  test("Tab commits with args when the editor text contains a trailing argument", async () => {
    const probe = mount({ editorText: "/login openai secret" });
    probe.captured.stdin.write("\t");
    await flush();
    expect(probe.captured.committed).toEqual([{ command: "login", args: "openai secret" }]);
  });

  test("Tab commits only the matched candidate when the prefix narrows to one", async () => {
    const probe = mount({ editorText: "/h" });
    probe.captured.stdin.write("\t");
    await flush();
    expect(probe.captured.committed).toEqual([{ command: "help", args: "" }]);
  });

  test("renders an overflow indicator when more than MAX_VISIBLE candidates match the empty prefix", () => {
    const many = Array.from({ length: 12 }, (_, i) => `cmd${i}`);
    const probe = mount({ editorText: "/", commands: many });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).toContain("…and 4 more");
  });

  test("renders nothing when session picker is open", () => {
    const probe = mount({ editorText: "/", sessionPickerOpen: true });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).not.toContain("help");
  });

  test("uses the SLASH_COMMAND_NAMES default fixture (no hand-maintained duplication)", () => {
    expect(SLASH_COMMAND_NAMES).toEqual([
      "help",
      "clear",
      "exit",
      "login",
      "logout",
      "model",
      "team",
      "resume",
      "continue",
    ]);
  });
});

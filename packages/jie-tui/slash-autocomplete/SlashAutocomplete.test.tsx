import { render } from "../test-renderer";
import { SlashAutocomplete, slashAutocompleteHeight } from "./SlashAutocomplete";
import { SLASH_COMMAND_NAMES } from "../command-handler";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

interface MountArgs {
  readonly editorText: string;
  readonly sessionPickerOpen?: boolean;
  readonly commands?: ReadonlyArray<string>;
  readonly maxRows?: number;
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
      maxRows={args.maxRows}
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

  test("renders only as many entries as maxRows allows, with a truthful overflow count", () => {
    const probe = mount({ editorText: "/", maxRows: 6 });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).toContain("/help");
    expect(frame).toContain("/clear");
    expect(frame).not.toContain("/exit");
    expect(frame).toContain("…and 7 more");
  });

  test("renders nothing when maxRows cannot fit a single entry", () => {
    const probe = mount({ editorText: "/", maxRows: 4 });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame.trim()).toBe("");
  });

  test("Tab cycles and commits only entries that are rendered when clamped", async () => {
    const many = Array.from({ length: 12 }, (_, i) => `cmd${i}`);
    const probe = mount({ editorText: "/", commands: many, maxRows: 6 });
    probe.captured.stdin.write("\x1b[Z");
    await flush();
    probe.captured.stdin.write("\t");
    await flush();
    expect(probe.captured.committed).toEqual([{ command: "cmd1", args: "" }]);
  });

});

describe("slashAutocompleteHeight", () => {
  test("is 0 when the editor text does not start with a slash", () => {
    expect(slashAutocompleteHeight("hello", false, SLASH_COMMAND_NAMES, 30)).toBe(0);
  });

  test("is 0 while the session picker is open", () => {
    expect(slashAutocompleteHeight("/", true, SLASH_COMMAND_NAMES, 30)).toBe(0);
  });

  test("is 0 when no command matches the prefix", () => {
    expect(slashAutocompleteHeight("/zz", false, SLASH_COMMAND_NAMES, 30)).toBe(0);
  });

  test("counts the border, header, entries, and overflow row", () => {
    expect(slashAutocompleteHeight("/h", false, SLASH_COMMAND_NAMES, 30)).toBe(2 + 1 + 1);
    expect(slashAutocompleteHeight("/", false, SLASH_COMMAND_NAMES, 30)).toBe(2 + 1 + 8 + 1);
  });

  test("clamps the entries so the panel never exceeds maxRows", () => {
    expect(slashAutocompleteHeight("/", false, SLASH_COMMAND_NAMES, 6)).toBe(6);
    expect(slashAutocompleteHeight("/", false, SLASH_COMMAND_NAMES, 5)).toBe(5);
  });

  test("hides the panel when maxRows cannot fit one entry plus its overflow row", () => {
    expect(slashAutocompleteHeight("/", false, SLASH_COMMAND_NAMES, 4)).toBe(0);
  });

  test("keeps an exact-fit panel when every entry fits with no overflow row", () => {
    expect(slashAutocompleteHeight("/h", false, SLASH_COMMAND_NAMES, 4)).toBe(4);
  });
});

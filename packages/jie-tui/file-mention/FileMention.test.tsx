import { render } from "../test-renderer";
import { FileMention, fileMentionHeight } from "./FileMention";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

const FILES: ReadonlyArray<{ readonly path: string }> = [
  { path: "src/main.ts" },
  { path: "src/utils/helper.ts" },
  { path: "packages/foo.ts" },
];

const MANY_FILES: ReadonlyArray<{ readonly path: string }> = Array.from({ length: 12 }, (_, i) => ({ path: `f${i}.ts` }));

interface MountArgs {
  readonly editorText: string;
  readonly sessionPickerOpen?: boolean;
  readonly files?: ReadonlyArray<{ readonly path: string }>;
  readonly maxRows?: number;
}

interface Inserted {
  readonly path: string;
  readonly tokenStart: number;
  readonly tokenEnd: number;
}

interface MountHandle {
  readonly captured: {
    readonly inserted: ReadonlyArray<Inserted>;
    readonly lastFrame: () => string | undefined;
    readonly stdin: { write: (data: string) => void };
  };
}

function mount(args: MountArgs): MountHandle {
  const inserted: Inserted[] = [];
  const files = args.files ?? FILES;
  const out = render(
    <FileMention
      editorText={args.editorText}
      sessionPickerOpen={args.sessionPickerOpen ?? false}
      files={files}
      maxRows={args.maxRows}
      onInsert={(path, tokenStart, tokenEnd): void => {
        inserted.push({ path, tokenStart, tokenEnd });
      }}
    />,
  );
  return {
    captured: {
      inserted,
      lastFrame: out.lastFrame,
      stdin: out.stdin,
    },
  };
}

describe("FileMention", () => {
  test("renders nothing when editorText is empty", () => {
    const probe = mount({ editorText: "" });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).not.toContain("main.ts");
  });

  test("renders nothing when editorText does not contain `@`", () => {
    const probe = mount({ editorText: "hello world" });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).not.toContain("main.ts");
  });

  test("renders all files when editorText contains `@` and no suffix", () => {
    const probe = mount({ editorText: "@" });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).toContain("main.ts");
    expect(frame).toContain("helper.ts");
    expect(frame).toContain("foo.ts");
  });

  test("filters files by prefix substring", () => {
    const probe = mount({ editorText: "@main" });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).toContain("main.ts");
    expect(frame).not.toContain("helper.ts");
  });

  test("stops the mention at the first whitespace boundary", () => {
    const probe = mount({ editorText: "@main and more text" });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).toContain("main.ts");
    expect(frame).not.toContain("helper.ts");
    expect(frame).not.toContain("foo.ts");
  });

  test("renders nothing when no file matches the prefix", () => {
    const probe = mount({ editorText: "@zz" });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame.trim()).toBe("");
  });

  test("Tab inserts the focused file path and reports it via onInsert", async () => {
    const probe = mount({ editorText: "@main" });
    probe.captured.stdin.write("\t");
    await flush();
    expect(probe.captured.inserted).toEqual([{ path: "src/main.ts", tokenStart: 0, tokenEnd: 5 }]);
  });

  test("Tab reports the mention token range so the typed query can be replaced", async () => {
    const probe = mount({ editorText: "fix @main now" });
    probe.captured.stdin.write("\t");
    await flush();
    expect(probe.captured.inserted).toEqual([{ path: "src/main.ts", tokenStart: 4, tokenEnd: 9 }]);
  });

  test("Shift+Tab cycles focus backward through the candidate list", async () => {
    const probe = mount({ editorText: "@" });
    probe.captured.stdin.write("[Z");
    await flush();
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).toMatch(/  \*/);
  });

  test("renders overflow indicator when candidate count exceeds MAX_VISIBLE", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ path: `f${i}.ts` }));
    const probe = mount({ editorText: "@", files: many });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).toContain("…and 4 more");
  });

  test("renders nothing when session picker is open", () => {
    const probe = mount({ editorText: "@", sessionPickerOpen: true });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).not.toContain("main.ts");
  });

  test("renders nothing inside a slash command so the slash picker owns Tab", () => {
    const probe = mount({ editorText: "/resume @" });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame.trim()).toBe("");
  });

  test("renders only as many entries as maxRows allows, with a truthful overflow count", () => {
    const probe = mount({ editorText: "@", files: MANY_FILES, maxRows: 6 });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame).toContain("f0.ts");
    expect(frame).toContain("f1.ts");
    expect(frame).not.toContain("f2.ts");
    expect(frame).toContain("…and 10 more");
  });

  test("renders nothing when maxRows cannot fit a single entry", () => {
    const probe = mount({ editorText: "@", maxRows: 4 });
    const frame = probe.captured.lastFrame() ?? "";
    expect(frame.trim()).toBe("");
  });
});

describe("fileMentionHeight", () => {
  test("is 0 when the editor text has no mention", () => {
    expect(fileMentionHeight("hello world", false, FILES, 30)).toBe(0);
  });

  test("is 0 while the session picker is open", () => {
    expect(fileMentionHeight("@", true, FILES, 30)).toBe(0);
  });

  test("is 0 inside a slash command so the slash picker owns Tab", () => {
    expect(fileMentionHeight("/resume @", false, FILES, 30)).toBe(0);
  });

  test("is 0 when no file matches the prefix", () => {
    expect(fileMentionHeight("@zz", false, FILES, 30)).toBe(0);
  });

  test("counts the border, header, entries, and overflow row", () => {
    expect(fileMentionHeight("@main", false, FILES, 30)).toBe(2 + 1 + 1);
    expect(fileMentionHeight("@", false, MANY_FILES, 30)).toBe(2 + 1 + 8 + 1);
  });

  test("clamps the entries so the panel never exceeds maxRows", () => {
    expect(fileMentionHeight("@", false, MANY_FILES, 6)).toBe(6);
  });

  test("hides the panel when maxRows cannot fit one entry plus its overflow row", () => {
    expect(fileMentionHeight("@", false, MANY_FILES, 4)).toBe(0);
  });
});

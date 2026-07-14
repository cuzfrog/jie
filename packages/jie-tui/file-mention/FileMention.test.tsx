import { render } from "../test-renderer";
import { FileMention } from "./FileMention";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

interface MountArgs {
  readonly editorText: string;
  readonly sessionPickerOpen?: boolean;
  readonly files?: ReadonlyArray<{ readonly path: string }>;
}

interface MountHandle {
  readonly captured: {
    readonly inserted: string[];
    readonly lastFrame: () => string | undefined;
    readonly stdin: { write: (data: string) => void };
  };
}

function mount(args: MountArgs): MountHandle {
  const inserted: string[] = [];
  const files = args.files ?? [
    { path: "src/main.ts" },
    { path: "src/utils/helper.ts" },
    { path: "packages/foo.ts" },
  ];
  const out = render(
    <FileMention
      editorText={args.editorText}
      sessionPickerOpen={args.sessionPickerOpen ?? false}
      files={files}
      onInsert={(path): void => {
        inserted.push(path);
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
    expect(probe.captured.inserted).toEqual(["src/main.ts"]);
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
});

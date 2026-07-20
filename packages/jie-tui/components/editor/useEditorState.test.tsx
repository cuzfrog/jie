import { render } from "../../test-renderer";
import { useRef, useState } from "react";
import type { JSX } from "react";
import { useEditorState } from "./useEditorState";
import type { EditorStateApi } from "./useEditorState";
import type { EditorBuffer } from "./editor-state";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

interface ProbeHandles {
  set: (text: string) => void;
  insert: (text: string) => void;
  readBuffer: () => EditorBuffer;
  readValue: () => string;
}

function Probe({ onReady }: { onReady: (handles: ProbeHandles) => void }): JSX.Element {
  const apiRef = useRef<EditorStateApi | null>(null);
  const api = useEditorState("");
  apiRef.current = api;
  onReady({
    set: (text) => apiRef.current!.setValue(text),
    insert: (text) => apiRef.current!.insert(text),
    readBuffer: () => apiRef.current!.buffer,
    readValue: () => apiRef.current!.readValue(),
  });
  return <></>;
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface EchoHandles {
  insert: (text: string) => void;
  moveLeft: () => void;
  moveUp: () => void;
  lineStart: () => void;
  readBuffer: () => EditorBuffer;
}

function EchoProbe({ onReady }: { onReady: (handles: EchoHandles) => void }): JSX.Element {
  const [text, setText] = useState("");
  const apiRef = useRef<EditorStateApi | null>(null);
  const api = useEditorState(text, { onChange: setText });
  apiRef.current = api;
  onReady({
    insert: (t) => apiRef.current!.insert(t),
    moveLeft: () => apiRef.current!.moveCursorLeft(),
    moveUp: () => apiRef.current!.moveCursorUp(),
    lineStart: () => apiRef.current!.moveLineStart(),
    readBuffer: () => apiRef.current!.buffer,
  });
  return <></>;
}

describe("useEditorState", () => {
  test("starts at an empty single-line buffer with the cursor at (0,0)", async () => {
    let handles: ProbeHandles | null = null;
    const { unmount } = render(<Probe onReady={(h) => { handles = h; }} />);
    await wait(20);
    expect(handles!.readBuffer()).toEqual({ lines: [""], cursorLine: 0, cursorCol: 0 });
    unmount();
  });

  test("initial value is parsed into a multi-line buffer with the cursor at the end of the last line", async () => {
    const readBufferRef: { current: EditorBuffer | null } = { current: null };
    function InitProbe(): JSX.Element {
      const api = useEditorState("line1\nline2");
      readBufferRef.current = api.buffer;
      return <></>;
    }
    render(<InitProbe />);
    await wait(20);
    expect(readBufferRef.current).toEqual({ lines: ["line1", "line2"], cursorLine: 1, cursorCol: 5 });
  });

  test("insert updates the buffer and advances the cursor", async () => {
    let handles: ProbeHandles | null = null;
    const { unmount } = render(<Probe onReady={(h) => { handles = h; }} />);
    await wait(20);
    handles!.insert("hi");
    await wait(10);
    expect(handles!.readBuffer()).toEqual({ lines: ["hi"], cursorLine: 0, cursorCol: 2 });
    handles!.insert("!");
    await wait(10);
    expect(handles!.readBuffer()).toEqual({ lines: ["hi!"], cursorLine: 0, cursorCol: 3 });
    unmount();
  });

  test("readValue sees updates within the same task, before any re-render", async () => {
    // Multiple input events in one stdin chunk are handled synchronously in a
    // single task, before React re-renders. A submit arriving right after an
    // insert must still see the inserted text, so the api exposes a
    // synchronous read of the buffer that does not wait for the render
    // snapshot.
    let handles: ProbeHandles | null = null;
    const { unmount } = render(<Probe onReady={(h) => { handles = h; }} />);
    await wait(20);
    handles!.insert("hi");
    expect(handles!.readValue()).toBe("hi");
    handles!.set("");
    expect(handles!.readValue()).toBe("");
    handles!.insert("ab");
    handles!.insert("cd");
    expect(handles!.readValue()).toBe("abcd");
    unmount();
  });

  test("setValue replaces the buffer; subsequent inserts work against the new content", async () => {
    let handles: ProbeHandles | null = null;
    const { unmount } = render(<Probe onReady={(h) => { handles = h; }} />);
    await wait(20);
    handles!.set("ab\ncd");
    await wait(10);
    expect(handles!.readBuffer()).toEqual({ lines: ["ab", "cd"], cursorLine: 1, cursorCol: 2 });
    handles!.insert("X");
    await wait(10);
    expect(handles!.readBuffer()).toEqual({ lines: ["ab", "cdX"], cursorLine: 1, cursorCol: 3 });
    unmount();
  });

  test("setValue with empty text resets to a single empty line", async () => {
    let handles: ProbeHandles | null = null;
    const { unmount } = render(<Probe onReady={(h) => { handles = h; }} />);
    await wait(20);
    handles!.set("hello");
    await wait(10);
    handles!.set("");
    await wait(10);
    expect(handles!.readBuffer()).toEqual({ lines: [""], cursorLine: 0, cursorCol: 0 });
    unmount();
  });

  test("applyExternalValue updates the buffer without affecting subsequent reads", async () => {
    let handles: ProbeHandles | null = null;
    const { unmount } = render(<Probe onReady={(h) => { handles = h; }} />);
    await wait(20);
    handles!.insert("typed");
    await wait(10);
    handles!.set("from outside");
    await wait(10);
    expect(handles!.readBuffer()).toEqual({ lines: ["from outside"], cursorLine: 0, cursorCol: "from outside".length });
    handles!.insert("!");
    await wait(10);
    expect(handles!.readBuffer()).toEqual({ lines: ["from outside!"], cursorLine: 0, cursorCol: "from outside!".length });
    unmount();
  });

  test("mid-buffer insert keeps the cursor when the new value echoes back through initialValue", async () => {
    let handles: EchoHandles | null = null;
    const { unmount } = render(<EchoProbe onReady={(h) => { handles = h; }} />);
    await wait(20);
    handles!.insert("ac");
    await wait(20);
    handles!.moveLeft();
    handles!.insert("b");
    await wait(20);
    expect(handles!.readBuffer()).toEqual({ lines: ["abc"], cursorLine: 0, cursorCol: 2 });
    unmount();
  });

  test("insert on a non-last line keeps the cursor line when the value echoes back", async () => {
    let handles: EchoHandles | null = null;
    const { unmount } = render(<EchoProbe onReady={(h) => { handles = h; }} />);
    await wait(20);
    handles!.insert("ab\ncd");
    await wait(20);
    handles!.moveUp();
    handles!.lineStart();
    handles!.insert("X");
    await wait(20);
    expect(handles!.readBuffer()).toEqual({ lines: ["Xab", "cd"], cursorLine: 0, cursorCol: 1 });
    unmount();
  });
});

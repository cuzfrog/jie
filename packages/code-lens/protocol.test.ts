import { encodeMessage, extractMessages, type ResponseMessage } from "./protocol";

describe("extractMessages", () => {
  test("returns complete newline-terminated lines and keeps no remainder", () => {
    const [messages, remainder] = extractMessages("{\"a\":1}\n{\"b\":2}\n");
    expect(messages).toEqual(["{\"a\":1}", "{\"b\":2}"]);
    expect(remainder).toBe("");
  });

  test("keeps a trailing partial line as the remainder", () => {
    const [messages, remainder] = extractMessages("{\"a\":1}\n{\"b\":");
    expect(messages).toEqual(["{\"a\":1}"]);
    expect(remainder).toBe("{\"b\":");
  });

  test("skips blank lines", () => {
    const [messages] = extractMessages("\n{\"a\":1}\n\n");
    expect(messages).toEqual(["{\"a\":1}"]);
  });

  test("returns nothing for an empty buffer", () => {
    const [messages, remainder] = extractMessages("");
    expect(messages).toEqual([]);
    expect(remainder).toBe("");
  });

  test("reassembles a message split across chunks", () => {
    const [first, rest] = extractMessages("{\"a\":");
    expect(first).toEqual([]);
    const [second] = extractMessages(rest + "1}\n");
    expect(second).toEqual(["{\"a\":1}"]);
  });
});

describe("encodeMessage", () => {
  test("writes a single newline-terminated JSON line", () => {
    const message: ResponseMessage = { jsonrpc: "2.0", id: 1, result: { ok: true } };
    const encoded = encodeMessage(message);
    expect(encoded.endsWith("\n")).toBe(true);
    expect(encoded.slice(0, -1)).not.toContain("\n");
    expect(JSON.parse(encoded)).toEqual(message);
  });
});

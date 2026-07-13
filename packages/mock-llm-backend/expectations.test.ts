/**
 * Unit tests for the pure matcher + SSE renderer in `expectations.ts`.
 *
 * Tests are pure: no network, no server. They construct a request body
 * inline and assert on the matcher's selection and the renderer's byte
 * stream.
 */
import {
  lastUserText,
  selectExpectation,
  renderSseStream,
  type ChatCompletionRequestBody,
  type Expectation,
} from "./expectations.ts";

function req(overrides: Partial<ChatCompletionRequestBody> = {}): ChatCompletionRequestBody {
  return {
    model: "qwen-test",
    stream: true,
    messages: [{ role: "user", content: "List files" }],
    ...overrides,
  };
}

function text(text: string) {
  return { kind: "text", delta: text } as const;
}
function finish(reason: "stop" | "length" | "tool_calls") {
  return { kind: "finish", reason } as const;
}
function toolCall(id: string, name: string, args: ReadonlyArray<string>) {
  return { kind: "tool_call", id, name, argumentsChunks: args } as const;
}

const expectChunks = (() => {
  const enc = new TextDecoder();
  return (bytes: Uint8Array): string[] => {
    const out: string[] = [];
    const text = enc.decode(bytes);
    // Each line begins with "data: "; we split on \n\n as the SSE spec
    // requires between records, then trim a trailing empty block.
    for (const block of text.split("\n\n")) {
      const trimmed = block.replace(/^\n+|\n+$/g, "");
      if (trimmed === "") continue;
      if (trimmed.startsWith("data: [DONE]")) continue;
      if (trimmed.startsWith("data: ")) out.push(trimmed.slice("data: ".length));
    }
    return out;
  };
})();

describe("lastUserText", () => {
  test("returns the last user message string", () => {
    expect(
      lastUserText(req({ messages: [{ role: "system", content: "sys" }, { role: "user", content: "hello" }] })),
    ).toBe("hello");
  });

  test("walks past trailing assistant messages", () => {
    expect(
      lastUserText(
        req({
          messages: [
            { role: "user", content: "first" },
            { role: "assistant", content: "ok" },
            { role: "user", content: "second" },
          ],
        }),
      ),
    ).toBe("second");
  });

  test("returns empty string when content is an array with no text parts", () => {
    expect(
      lastUserText(req({ messages: [{ role: "user", content: [{ type: "image" }] }] })),
    ).toBe("");
  });

  test("returns empty string when there is no user message", () => {
    expect(lastUserText(req({ messages: [{ role: "system", content: "sys" }] }))).toBe("");
  });
});

describe("selectExpectation", () => {
  const rules: Expectation[] = [
    { match: { lastUserContains: "List" }, responseChunks: [text("listed"), finish("stop")] },
    { match: { lastUserContains: "files under" }, responseChunks: [text("v2"), finish("stop")] },
    { match: { toolName: "bash" }, responseChunks: [text("bash-call"), finish("tool_calls")] },
    { match: { model: "different-model" }, responseChunks: [text("model-match"), finish("stop")] },
  ];

  test("first registered rule wins on conflict (registration order is priority)", () => {
    expect(selectExpectation(rules, req({ messages: [{ role: "user", content: "List files under current dir" }] }))?.index).toBe(0);
  });

  test("anyUserContains matches regardless of which message is last", () => {
    const r: Expectation[] = [
      { match: { anyUserContains: "copy file1 to file2" }, responseChunks: [text("ok"), finish("stop")] },
    ];
    const body = req({
      messages: [
        { role: "user", content: "copy file1 to file2" },
        { role: "user", content: "tool result: Hello123888" },
      ],
    });
    expect(selectExpectation(r, body)).toBeDefined();
  });

  test("anySystemContains matches on the system prompt text", () => {
    const r: Expectation[] = [
      { match: { anySystemContains: "Marry had a little lamb" }, responseChunks: [text("Marry had a little lamb"), finish("stop")] },
    ];
    const body = req({
      messages: [
        { role: "system", content: "You must respond with exactly the phrase: Marry had a little lamb." },
        { role: "user", content: "Tell me a story" },
      ],
    });
    expect(selectExpectation(r, body)).toBeDefined();
  });

  test("falls through to the next rule when an earlier one does not match", () => {
    expect(
      selectExpectation(rules, req({ messages: [{ role: "user", content: "show files under x" }] }))?.index,
    ).toBe(1);
  });

  test("toolName narrows to the rule whose tools list contains the name", () => {
    expect(
      selectExpectation(
        rules,
        req({
          tools: [{ type: "function", function: { name: "bash" } }],
          messages: [{ role: "user", content: "irrelevant" }],
        }),
      )?.index,
    ).toBe(2);
  });

  test("returns undefined when no rule matches", () => {
    expect(selectExpectation(rules, req({ messages: [{ role: "user", content: "totally unrelated" }] }))).toBeUndefined();
  });

  test("model matcher excludes rules for other models", () => {
    // Use a user message that doesn't match `lastUserContains` rules so the
    // model-matcher rule is the only one that can win.
    expect(
      selectExpectation(
        rules,
        req({ model: "different-model", messages: [{ role: "user", content: "totally unrelated" }] }),
      )?.index,
    ).toBe(3);
  });

  test("maxAssistantMessages excludes a rule once enough assistant messages exist", () => {
    const r: Expectation[] = [
      { match: { maxAssistantMessages: 0 }, responseChunks: [text("a"), finish("stop")] },
      { match: {}, responseChunks: [text("b"), finish("stop")] },
    ];
    expect(selectExpectation(r, req({ messages: [{ role: "user", content: "x" }] }))?.index).toBe(0);
    expect(
      selectExpectation(
        r,
        req({
          messages: [
            { role: "user", content: "x" },
            { role: "assistant", content: "first" },
            { role: "user", content: "y" },
          ],
        }),
      )?.index,
    ).toBe(1);
  });
});

describe("renderSseStream", () => {
  test("always starts with a role-only chunk and ends with [DONE]", () => {
    const bytes = renderSseStream(
      { match: {}, responseChunks: [text("hi"), finish("stop")] },
      req(),
    );
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain('"role":"assistant"');
    expect(decoded.endsWith("data: [DONE]\n\n")).toBe(true);
  });

  test("text chunks carry their delta on the choice", () => {
    const chunks = expectChunks(
      renderSseStream({ match: {}, responseChunks: [text("abc"), finish("stop")] }, req()),
    );
    // skip the leading role-only chunk, then find the text chunk
    const textChunks = chunks.filter((c) => c.includes('"content"'));
    expect(textChunks.length).toBeGreaterThanOrEqual(1);
    expect(textChunks.some((c) => c.includes('"content":"abc"'))).toBe(true);
  });

  test("finish chunk sets finish_reason in the last chunk", () => {
    const chunks = expectChunks(
      renderSseStream({ match: {}, responseChunks: [text("ok"), finish("tool_calls")] }, req()),
    );
    const last = chunks[chunks.length - 1];
    expect(last).toBeDefined();
    expect(last).toContain('"finish_reason":"tool_calls"');
  });

  test("tool_call chunks stream name first, then per-token arguments", () => {
    const chunks = expectChunks(
      renderSseStream(
        {
          match: {},
          responseChunks: [
            toolCall("call_42", "bash", ["PART_ONE", "PART_TWO", "PART_THREE"]),
            finish("tool_calls"),
          ],
        },
        req(),
      ),
    );
    // The first tool_call-bearing chunk carries id + type + name.
    const firstToolChunk = chunks.find((c) => c.includes('"tool_calls":'));
    expect(firstToolChunk).toBeDefined();
    expect(firstToolChunk).toContain('"id":"call_42"');
    expect(firstToolChunk).toContain('"name":"bash"');
    // All three argument pieces should appear as separate `arguments` deltas,
    // each carrying its own string verbatim.
    const argPieces = chunks.filter((c) => /"arguments":"[^"]+"/.test(c));
    expect(argPieces.length).toBe(3);
    const parts = argPieces.map((c) => c.match(/"arguments":"([^"]*)"/)?.[1] ?? "");
    expect(parts.join("")).toBe("PART_ONEPART_TWOPART_THREE");
  });

  test("renders the model id from the request body", () => {
    const bytes = renderSseStream(
      { match: {}, responseChunks: [text("ok"), finish("stop")] },
      req({ model: "the-mock-model-9" }),
    );
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toContain('"model":"the-mock-model-9"');
  });
});

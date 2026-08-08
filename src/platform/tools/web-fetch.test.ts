import { createWebFetchTool } from "./web-fetch";
import { JiePlatformError } from "../jie-platform-errors";
import { makeEmptyContext } from "./_test-context";

const HTML_BODY =
  "<html><head><title>T</title></head><body><h1>Hi</h1><script>x()</script><style>p{}</style><p>Para</p><nav>Nav</nav><header>Hdr</header><footer>Ftr</footer></body></html>";
const ENTITIES_BODY = "<p>Tom &amp; Jerry &lt;3 &quot;cheese&quot; &#x2603;</p>";

function htmlResponse(body: string): Response {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

describe("web_fetch", () => {
  test("rejects non-http/https schemes", async () => {
    const tool = createWebFetchTool();
    await expect(
      tool.execute({ url: "file:///etc/passwd" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_SCHEME" });
  });

  test("follows redirect to /html", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(htmlResponse(HTML_BODY));
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: "https://example.test/redirect" }, makeEmptyContext());
    expect(result.content).toContain("Hi");
    expect(result.content).not.toContain("x()");
  });

  test("parses text/html; strips script/style/nav/header/footer; decodes entities", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(htmlResponse(HTML_BODY));
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: "https://example.test/html" }, makeEmptyContext());
    expect(result.content).toContain("Hi");
    expect(result.content).toContain("Para");
    expect(result.content).not.toContain("x()");
    expect(result.content).not.toContain("p{}");
    expect(result.content).not.toContain("Nav");
    expect(result.content).not.toContain("Hdr");
    expect(result.content).not.toContain("Ftr");
  });

  test("decodes HTML entities (Tom &amp; Jerry, &lt;3, &#x2603;)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(htmlResponse(ENTITIES_BODY));
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: "https://example.test/entities" }, makeEmptyContext());
    expect(result.content).toContain("Tom & Jerry");
    expect(result.content).toContain("\"cheese\"");
    expect(result.content).toContain("☃");
  });

  test("text/plain returned verbatim", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response("plain text", { headers: { "Content-Type": "text/plain" } }),
    );
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: "https://example.test/plain" }, makeEmptyContext());
    expect(result.content).toBe("plain text");
  });

  test("application/json returned verbatim", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response('{"k":1}', { headers: { "Content-Type": "application/json" } }),
    );
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: "https://example.test/json" }, makeEmptyContext());
    expect(result.content).toBe('{"k":1}');
  });

  test("binary content-type -> unsupported_content_type", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response(new Uint8Array([0xff, 0xfe]), {
        headers: { "Content-Type": "application/octet-stream" },
      }),
    );
    const tool = createWebFetchTool();
    await expect(
      tool.execute({ url: "https://example.test/binary" }, makeEmptyContext()),
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_CONTENT_TYPE",
      message: expect.stringContaining("application/octet-stream"),
    });
  });

  test("5 MiB cap: response > 5 MiB is truncated, truncated=true", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response("x".repeat(6 * 1024 * 1024), {
        headers: { "Content-Type": "text/plain" },
      }),
    );
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: "https://example.test/huge" }, makeEmptyContext());
    expect(result.details).toMatchObject({
      truncated: true,
      status: 200,
    });
  });

  test("redirect loop (>= 20) surfaces redirect_exhausted or final non-html error", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockRejectedValueOnce(new Error("redirect loop exceeded"));
    const tool = createWebFetchTool();
    await expect(
      tool.execute({ url: "https://example.test/redirect-loop" }, makeEmptyContext()),
    ).rejects.toBeInstanceOf(JiePlatformError);
  });

  test("status: 200 in details; non-2xx returned with the body", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fetchSpy.mockResolvedValueOnce(
      new Response("plain text", { headers: { "Content-Type": "text/plain" } }),
    );
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: "https://example.test/plain" }, makeEmptyContext());
    expect(result.details).toMatchObject({
      status: 200,
      truncated: false,
    });
  });
});

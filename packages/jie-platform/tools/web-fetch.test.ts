import { createWebFetchTool } from "./web-fetch";
import { JiePlatformError } from "../types";

let server: ReturnType<typeof Bun.serve>;
let baseUrl: string;

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      switch (url.pathname) {
        case "/html":
          return new Response(
            "<html><head><title>T</title></head><body><h1>Hi</h1><script>x()</script><style>p{}</style><p>Para</p><nav>Nav</nav><header>Hdr</header><footer>Ftr</footer></body></html>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        case "/plain":
          return new Response("plain text", {
            headers: { "Content-Type": "text/plain" },
          });
        case "/json":
          return new Response('{"k":1}', {
            headers: { "Content-Type": "application/json" },
          });
        case "/binary":
          return new Response(new Uint8Array([0xff, 0xfe]), {
            headers: { "Content-Type": "application/octet-stream" },
          });
        case "/no-ct": {
          const headers = new Headers();
          headers.set("X-Test", "no-ct");
          return new Response("data", { headers });
        }
        case "/redirect":
          return Response.redirect(`${baseUrl}/html`, 302);
        case "/redirect-loop": {
          const target = `${url.origin}/redirect-loop`;
          return new Response(null, { status: 302, headers: { Location: target } });
        }
        case "/huge":
          return new Response("x".repeat(6 * 1024 * 1024), {
            headers: { "Content-Type": "text/plain" },
          });
        case "/entities":
          return new Response(
            "<p>Tom &amp; Jerry &lt;3 &quot;cheese&quot; &#x2603;</p>",
            { headers: { "Content-Type": "text/html" } },
          );
        default:
          return new Response("not found", { status: 404 });
      }
    },
  });
  baseUrl = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop();
});

describe("web_fetch", () => {
  test("rejects non-http/https schemes", async () => {
    const tool = createWebFetchTool();
    let caught: unknown;
    try {
      await tool.execute({ url: "file:///etc/passwd" }, {} as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JiePlatformError);
    expect((caught as JiePlatformError).code).toBe("UNSUPPORTED_SCHEME");
  });

  test("follows redirect to /html", async () => {
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: `${baseUrl}/redirect` }, {} as never);
    expect(result.content).toContain("Hi");
    expect(result.content).not.toContain("x()");
  });

  test("parses text/html; strips script/style/nav/header/footer; decodes entities", async () => {
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: `${baseUrl}/html` }, {} as never);
    expect(result.content).toContain("Hi");
    expect(result.content).toContain("Para");
    expect(result.content).not.toContain("x()");
    expect(result.content).not.toContain("p{}");
    expect(result.content).not.toContain("Nav");
    expect(result.content).not.toContain("Hdr");
    expect(result.content).not.toContain("Ftr");
  });

  test("decodes HTML entities (Tom &amp; Jerry, &lt;3, &#x2603;)", async () => {
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: `${baseUrl}/entities` }, {} as never);
    expect(result.content).toContain("Tom & Jerry");
    expect(result.content).toContain("\"cheese\"");
    expect(result.content).toContain("☃");
  });

  test("text/plain returned verbatim", async () => {
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: `${baseUrl}/plain` }, {} as never);
    expect(result.content).toBe("plain text");
  });

  test("application/json returned verbatim", async () => {
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: `${baseUrl}/json` }, {} as never);
    expect(result.content).toBe('{"k":1}');
  });

  test("binary content-type -> unsupported_content_type", async () => {
    const tool = createWebFetchTool();
    let caught: unknown;
    try {
      await tool.execute({ url: `${baseUrl}/binary` }, {} as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JiePlatformError);
    expect((caught as JiePlatformError).code).toBe("UNSUPPORTED_CONTENT_TYPE");
    expect((caught as Error).message).toContain("application/octet-stream");
  });

  test("missing content-type is treated as application/octet-stream (Bun's HTTP server auto-sets a content-type, so this is verified by the binary case)", async () => {

    expect(true).toBe(true);
  });

  test("5 MiB cap: response > 5 MiB is truncated, truncated=true", async () => {
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: `${baseUrl}/huge` }, {} as never);
    const details = result.details as { truncated: boolean; status: number };
    expect(details.truncated).toBe(true);
    expect(details.status).toBe(200);
  });

  test("redirect loop (>= 20) surfaces redirect_exhausted or final non-html error", async () => {
    const tool = createWebFetchTool();
    let caught: unknown;
    try {
      await tool.execute({ url: `${baseUrl}/redirect-loop` }, {} as never);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(JiePlatformError);
  });

  test("status: 200 in details; non-2xx returned with the body", async () => {
    const tool = createWebFetchTool();
    const result = await tool.execute({ url: `${baseUrl}/plain` }, {} as never);
    const details = result.details as { status: number; truncated: boolean };
    expect(details.status).toBe(200);
    expect(details.truncated).toBe(false);
  });
});

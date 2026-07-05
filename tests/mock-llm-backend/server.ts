import {
  type ChatCompletionRequestBody,
  type Expectation,
  type RecordedCall,
  lastUserText,
  renderSseStream,
  selectExpectation,
} from "./expectations.ts";

interface StartedServer {
  readonly port: number;
  readonly stop: () => Promise<void>;
}

interface MockState {
  expectations: Expectation[];
  calls: RecordedCall[];
}

const defaultState: MockState = { expectations: [], calls: [] };

function sendJson(res: { readonly headers: Headers }, status: number, body: unknown): Response {
  const headers = new Headers(res.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

function buildHandler(state: MockState): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    if (url.pathname === "/health" && req.method === "GET") {
      return sendJson(req, 200, { ok: true });
    }

    if (url.pathname === "/mock/calls" && req.method === "GET") {
      return sendJson(req, 200, { calls: state.calls });
    }

    if (url.pathname === "/mock/expectations") {
      if (req.method === "POST") {
        let parsed: { expectations?: Expectation[] } = {};
        try {
          parsed = (await req.json()) as { expectations?: Expectation[] };
        } catch (cause) {
          return sendJson(req, 400, { error: { message: `invalid JSON body: ${String(cause)}` } });
        }
        const list = parsed.expectations;
        if (!Array.isArray(list)) {
          return sendJson(req, 400, { error: { message: "expected { expectations: Expectation[] }" } });
        }
        state.expectations = [...list];
        state.calls = [];
        return sendJson(req, 200, { registered: list.length });
      }
      if (req.method === "DELETE") {
        state.expectations = [];
        state.calls = [];
        return sendJson(req, 200, { cleared: true });
      }
      return sendJson(req, 405, { error: { message: "method not allowed" } });
    }

    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      return handleChatCompletion(req, state);
    }
    if (url.pathname === "/chat/completions" && req.method === "POST") {
      return handleChatCompletion(req, state);
    }

    return sendJson(req, 404, { error: { message: `not found: ${req.method} ${url.pathname}` } });
  };
}

async function handleChatCompletion(req: Request, state: MockState): Promise<Response> {
  let body: ChatCompletionRequestBody;
  try {
    body = (await req.json()) as ChatCompletionRequestBody;
  } catch (cause) {
    return sendJson(req, 400, { error: { message: `invalid JSON: ${String(cause)}` } });
  }

  const picked = selectExpectation(state.expectations, body);
  if (picked === undefined) {
    state.calls.push({
      expectationIndex: -1,
      model: body.model,
      lastUserText: "(no matching expectation)",
    });
    return sendJson(req, 500, {
      error: {
        message: "no expectation matched",
        type: "mock_no_match",
        param: null,
        code: null,
      },
    });
  }

  state.calls.push({
    expectationIndex: picked.index,
    model: body.model,
    lastUserText: lastUserText(body),
  });

  const bytes = renderSseStream(picked.expectation, body);
  const headers = new Headers();
  headers.set("content-type", "text/event-stream; charset=utf-8");
  headers.set("cache-control", "no-cache");
  return new Response(bytes, { status: 200, headers });
}

export async function startMockServer(port?: number): Promise<StartedServer> {
  const actualPort = port ?? 12346;
  const server = Bun.serve({
    port: actualPort,
    fetch: buildHandler(defaultState),
  });
  return {
    port: server.port ?? actualPort,
    stop: async () => {
      await server.stop();
    },
  };
}

export function createMockServer(opts: { port?: number; state?: MockState } = {}): StartedServer & { state: MockState } {
  const state = opts.state ?? { expectations: [], calls: [] };
  const server = Bun.serve({
    port: opts.port ?? 0,
    fetch: buildHandler(state),
  });
  return {
    port: server.port ?? 0,
    state,
    stop: async () => {
      await server.stop();
    },
  };
}

async function main(): Promise<void> {
  const { port, stop } = await startMockServer();
  console.log(`mock-llm-backend listening on http://localhost:${port}`);
  const shutdown = async (): Promise<void> => {
    await stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

if (import.meta.main) {
  await main();
}

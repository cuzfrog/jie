import {
  type ChatCompletionRequestBody,
  type Expectation,
  type MatchRule,
  type RecordedCall,
  lastUserText,
  renderSseStream,
  selectExpectation,
} from "./expectations.ts";

interface StartedServer {
  readonly port: number;
  readonly stop: () => Promise<void>;
}

interface SessionState {
  expectations: Expectation[];
  calls: RecordedCall[];
}

type SessionMap = Map<string, SessionState>;

const DEFAULT_SESSION = "__default__";

let VERBOSE = (process.env["LOG"] ?? "").length > 0;

function log(label: string, payload: unknown): void {
  if (!VERBOSE) return;
  const ts = new Date().toISOString();
  console.log(`[mock ${ts}] ${label} ${JSON.stringify(payload)}`);
}

function sendJson(res: { readonly headers: Headers }, status: number, body: unknown): Response {
  const headers = new Headers(res.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
}

function sessionOf(req: Request): string {
  const h = req.headers.get("x-mock-session");
  return h === null || h === "" ? DEFAULT_SESSION : h;
}

function summarizeMatch(rule: MatchRule): string {
  const parts: string[] = [];
  if (rule.lastUserContains !== undefined) parts.push(`lastUser~=${JSON.stringify(rule.lastUserContains)}`);
  if (rule.anyUserContains !== undefined) parts.push(`anyUser~=${JSON.stringify(rule.anyUserContains)}`);
  if (rule.anySystemContains !== undefined) parts.push(`anySystem~=${JSON.stringify(rule.anySystemContains)}`);
  if (rule.toolName !== undefined) parts.push(`tool=${rule.toolName}`);
  if (rule.model !== undefined) parts.push(`model=${rule.model}`);
  if (rule.minAssistantMessages !== undefined) parts.push(`minAssistant=${rule.minAssistantMessages}`);
  if (rule.maxAssistantMessages !== undefined) parts.push(`maxAssistant=${rule.maxAssistantMessages}`);
  return parts.join(" ");
}

function summarizeRequest(body: ChatCompletionRequestBody): Record<string, unknown> {
  let assistantCount = 0;
  let userCount = 0;
  let toolCount = 0;
  let systemCount = 0;
  for (const m of body.messages) {
    if (m.role === "assistant") assistantCount++;
    else if (m.role === "user") userCount++;
    else if (m.role === "tool") toolCount++;
    else if (m.role === "system") systemCount++;
  }
  return {
    model: body.model,
    msgs: { total: body.messages.length, system: systemCount, user: userCount, assistant: assistantCount, tool: toolCount },
    lastUser: lastUserText(body).slice(0, 120),
    tools: (body.tools ?? []).map((t) => t.function.name),
  };
}

function buildHandler(sessions: SessionMap): (req: Request) => Promise<Response> {
  const ensure = (id: string): SessionState => {
    let s = sessions.get(id);
    if (s === undefined) {
      s = { expectations: [], calls: [] };
      sessions.set(id, s);
    }
    return s;
  };

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);

    if (url.pathname === "/health" && req.method === "GET") {
      return sendJson(req, 200, { ok: true });
    }

    if (url.pathname === "/mock/logging" && req.method === "POST") {
      let parsed: { enabled?: boolean } = {};
      try {
        parsed = (await req.json()) as { enabled?: boolean };
      } catch (cause) {
        return sendJson(req, 400, { error: { message: `invalid JSON: ${String(cause)}` } });
      }
      VERBOSE = parsed.enabled === true;
      return sendJson(req, 200, { verbose: VERBOSE });
    }

    if (url.pathname === "/mock/calls" && req.method === "GET") {
      const sid = url.searchParams.get("session");
      const state = sid === null ? null : sessions.get(sid);
      if (sid !== null && state === undefined) return sendJson(req, 404, { error: { message: `unknown session: ${sid}` } });
      return sendJson(req, 200, { calls: state?.calls ?? [] });
    }

    if (url.pathname === "/mock/expectations") {
      if (req.method === "POST") {
        let parsed: { expectations?: Expectation[]; session?: string } = {};
        try {
          parsed = (await req.json()) as { expectations?: Expectation[]; session?: string };
        } catch (cause) {
          return sendJson(req, 400, { error: { message: `invalid JSON body: ${String(cause)}` } });
        }
        const list = parsed.expectations;
        if (!Array.isArray(list)) {
          return sendJson(req, 400, { error: { message: "expected { expectations: Expectation[], session?: string }" } });
        }
        const sid = parsed.session ?? DEFAULT_SESSION;
        const state = ensure(sid);
        state.expectations = [...list];
        state.calls = [];
        log("register", { session: sid, count: list.length, rules: list.map((e) => summarizeMatch(e.match)) });
        return sendJson(req, 200, { registered: list.length, session: sid });
      }
      if (req.method === "DELETE") {
        const sid = url.searchParams.get("session");
        if (sid === null) {
          sessions.clear();
          log("clear-all", {});
          return sendJson(req, 200, { cleared: true });
        }
        sessions.delete(sid);
        log("clear-session", { session: sid });
        return sendJson(req, 200, { cleared: true, session: sid });
      }
      return sendJson(req, 405, { error: { message: "method not allowed" } });
    }

    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      return handleChatCompletion(req, ensure(sessionOf(req)));
    }
    if (url.pathname === "/chat/completions" && req.method === "POST") {
      return handleChatCompletion(req, ensure(sessionOf(req)));
    }

    return sendJson(req, 404, { error: { message: `not found: ${req.method} ${url.pathname}` } });
  };
}

async function handleChatCompletion(req: Request, state: SessionState): Promise<Response> {
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
      lastUserText: lastUserText(body),
    });
    log("NO-MATCH", { req: summarizeRequest(body), available: state.expectations.length });
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

  log("match", {
    idx: picked.index,
    rule: summarizeMatch(picked.expectation.match),
    chunks: picked.expectation.responseChunks.map((c) => c.kind),
    req: summarizeRequest(body),
  });

  const bytes = renderSseStream(picked.expectation, body);
  const headers = new Headers();
  headers.set("content-type", "text/event-stream; charset=utf-8");
  headers.set("cache-control", "no-cache");
  return new Response(bytes, { status: 200, headers });
}

export async function startMockServer(port?: number): Promise<StartedServer> {
  const actualPort = port ?? 12346;
  const sessions: SessionMap = new Map();
  const server = Bun.serve({
    port: actualPort,
    fetch: buildHandler(sessions),
  });
  log("started", { port: server.port ?? actualPort, verbose: VERBOSE });
  return {
    port: server.port ?? actualPort,
    stop: async () => {
      await server.stop();
    },
  };
}

export function createMockServer(opts: { port?: number } = {}): StartedServer & { sessions: SessionMap } {
  const sessions: SessionMap = new Map();
  const server = Bun.serve({
    port: opts.port ?? 0,
    fetch: buildHandler(sessions),
  });
  return {
    port: server.port ?? 0,
    sessions,
    stop: async () => {
      await server.stop();
    },
  };
}

async function main(): Promise<void> {
  const { port, stop } = await startMockServer();
  console.log(`mock-llm-backend listening on http://localhost:${port} (LOG=${VERBOSE ? "on" : "off"})`);
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
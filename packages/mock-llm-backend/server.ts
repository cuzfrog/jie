import { logger as log } from "../jie-platform"; // resume the logger without depending on jie-platform package; this is an exception

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

interface ServerState {
  expectations: Expectation[];
  calls: RecordedCall[];
}

export async function startMockServer(port?: number): Promise<StartedServer> {
  const actualPort = port ?? 12346;
  const state: ServerState = { expectations: [], calls: [] };
  const server = Bun.serve({
    port: actualPort,
    fetch: buildHandler(state),
  });
  log.info("started", { port: server.port ?? actualPort });
  return {
    port: server.port ?? actualPort,
    stop: async () => {
      await server.stop();
    },
  };
}

function buildHandler(state: ServerState): (req: Request) => Promise<Response> {
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
        log.debug("register", { count: list.length, rules: list.map((e) => summarizeMatch(e.match)) });
        return sendJson(req, 200, { registered: list.length });
      }
      if (req.method === "DELETE") {
        state.expectations = [];
        state.calls = [];
        log.debug("clear", {});
        return sendJson(req, 200, { cleared: true });
      }
      return sendJson(req, 405, { error: { message: "method not allowed" } });
    }

    if (
      (url.pathname === "/v1/chat/completions" || url.pathname === "/chat/completions") &&
      req.method === "POST"
    ) {
      return handleChatCompletion(req, state);
    }

    return sendJson(req, 404, { error: { message: `not found: ${req.method} ${url.pathname}` } });
  };
}

async function handleChatCompletion(req: Request, state: ServerState): Promise<Response> {
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
    log.warn("no-match", { req: summarizeRequest(body), available: state.expectations.length });
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

  log.debug("match", {
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

function sendJson(res: { readonly headers: Headers }, status: number, body: unknown): Response {
  const headers = new Headers(res.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { status, headers });
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

async function main(): Promise<void> {
  const { port, stop } = await startMockServer();
  log.info(`mock-llm-backend listening on http://localhost:${port}`);
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

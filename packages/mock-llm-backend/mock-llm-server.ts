import { type Server } from "bun";
import { logger as log } from "../jie-platform"; // resume the logger without depending on jie-platform package; this is an exception
import { type ExpectationStore } from "./expectation-store.ts";
import {
  type ChatCompletionRequestBody,
  type Expectation,
  type MatchRule,
  lastUserText,
  renderSseStream,
} from "./expectations.ts";

const DEFAULT_MOCK_PORT = 12346;

export class MockLlmServer {
  readonly port: number;
  private readonly expectationStore: ExpectationStore;
  private readonly server: Server<undefined>;

  constructor(expectationStore: ExpectationStore, port: number = DEFAULT_MOCK_PORT) {
    this.expectationStore = expectationStore;
    this.server = Bun.serve({ port, fetch: (req) => this.handle(req) });
    this.port = this.server.port ?? port;
    log.info("started", { port: this.port });
  }

  async stop(): Promise<void> {
    await this.server.stop();
  }

  private async handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/health" && req.method === "GET") {
      return sendJson(req, 200, { ok: true });
    }
    if (url.pathname === "/mock/calls" && req.method === "GET") {
      return sendJson(req, 200, { calls: this.expectationStore.calls() });
    }
    if (url.pathname === "/mock/expectations") {
      return this.handleExpectations(req);
    }
    if (
      (url.pathname === "/v1/chat/completions" || url.pathname === "/chat/completions") &&
      req.method === "POST"
    ) {
      return this.handleChatCompletion(req);
    }
    return sendJson(req, 404, { error: { message: `not found: ${req.method} ${url.pathname}` } });
  }

  private async handleExpectations(req: Request): Promise<Response> {
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
      this.expectationStore.register(list);
      log.debug("register", { count: list.length, rules: list.map((e) => summarizeMatch(e.match)) });
      return sendJson(req, 200, { registered: list.length });
    }
    if (req.method === "DELETE") {
      this.expectationStore.clear();
      log.debug("clear", {});
      return sendJson(req, 200, { cleared: true });
    }
    return sendJson(req, 405, { error: { message: "method not allowed" } });
  }

  private async handleChatCompletion(req: Request): Promise<Response> {
    let body: ChatCompletionRequestBody;
    try {
      body = (await req.json()) as ChatCompletionRequestBody;
    } catch (cause) {
      return sendJson(req, 400, { error: { message: `invalid JSON: ${String(cause)}` } });
    }

    const picked = this.expectationStore.selectAndRecord(body);
    if (picked === undefined) {
      log.warn("no-match", { req: summarizeRequest(body), available: this.expectationStore.expectationCount() });
      return sendJson(req, 500, {
        error: {
          message: "no expectation matched",
          type: "mock_no_match",
          param: null,
          code: null,
        },
      });
    }

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

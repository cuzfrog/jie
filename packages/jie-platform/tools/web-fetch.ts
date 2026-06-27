import { parse as parseHtml } from "node-html-parser";
import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError } from "../domain-types";

const WEB_FETCH_DESCRIPTION = `web_fetch(url): Fetch a URL and return its text content. Supports http/https
only (file://, ftp://, data:// are rejected). Follows up to 20 redirects.
Response body is capped at 5 MiB (truncated flag set if clipped). HTML
responses are parsed with \`node-html-parser\` (script/style/nav/header/footer
removed, entities decoded); other text-like types (text/plain, application/
json, application/xml, application/javascript, application/x-www-form-url-
encoded) are returned verbatim. Binary types (image/*, application/pdf,
application/zip, application/octet-stream, etc.) return \`unsupported_content_
type: <type>\`. The final HTTP status (after redirects) is in \`status\` — all
status classes are returned with the body, including 4xx/5xx (the LLM
branches on \`status\`; the platform does not surface non-2xx as an error).
Inherits the tool's 120s timeout.`;

const USER_AGENT = "JieBot/0.1 (+https://github.com/cuzfrog/jie)";
const BODY_CAP = 5 * 1024 * 1024;

const TEXT_LIKE_PREFIXES = ["text/"];
const TEXT_LIKE_APPLICATIONS = new Set<string>([
  "application/json",
  "application/ld+json",
  "application/manifest+json",
  "application/vnd.api+json",
  "application/xml",
  "application/atom+xml",
  "application/rss+xml",
  "application/xhtml+xml",
  "application/javascript",
  "application/ecmascript",
  "application/x-javascript",
  "application/x-www-form-urlencoded",
  "application/yaml",
  "application/x-yaml",
  "application/toml",
  "application/sql",
  "application/graphql",
  "application/graphql+json",
]);

function isTextLike(contentType: string): boolean {
  const ct = contentType.split(";")[0]!.trim().toLowerCase();
  if (TEXT_LIKE_PREFIXES.some((p) => ct.startsWith(p))) return true;
  if (TEXT_LIKE_APPLICATIONS.has(ct)) return true;
  return false;
}

function isHtml(contentType: string): boolean {
  return contentType.split(";")[0]!.trim().toLowerCase() === "text/html";
}

const STRIP_TAGS = ["script", "style", "nav", "header", "footer"];

function htmlToText(html: string): string {
  const root = parseHtml(html);
  for (const tag of STRIP_TAGS) {
    for (const el of root.querySelectorAll(tag)) {
      el.remove();
    }
  }
  return root.text;
}

function decodeBody(bytes: Uint8Array, charset: string | null): string {
  if (charset === null) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }

  const normalized = normalizeCharset(charset);
  try {
    return new TextDecoder(
      normalized as ConstructorParameters<typeof TextDecoder>[0],
      { fatal: false },
    ).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function normalizeCharset(c: string): string {
  const lower = c.toLowerCase().replace(/^["']|["']$/g, "");
  if (lower === "utf8") return "utf-8";
  return lower;
}

function extractCharset(contentType: string): string | null {
  const match = /charset=([^;]+)/i.exec(contentType);
  return match === null ? null : match[1]!.trim().replace(/^["']|["']$/g, "");
}

interface WebFetchInput {
  url: string;
}

export function createWebFetchTool(): Tool<WebFetchInput> {
  return {
    name: "web_fetch",
    description: WEB_FETCH_DESCRIPTION,
    label: "Web Fetch",
    parameters: Type.Object({
      url: Type.String(),
    }),
    async execute(input: WebFetchInput): Promise<ToolResult> {
      let url: URL;
      try {
        url = new URL(input.url);
      } catch {
        throw new JiePlatformError(
          "unsupported_scheme",
          `unsupported_scheme: ${input.url}`,
        );
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new JiePlatformError(
          "unsupported_scheme",
          `unsupported_scheme: ${url.protocol}`,
        );
      }

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { "User-Agent": USER_AGENT },
        });
      } catch (e) {
        throw new JiePlatformError(
          "redirect_exhausted",
          `redirect_exhausted: ${(e as Error).message}`,
        );
      }

      const contentType = response.headers.get("content-type") ?? "application/octet-stream";

      if (!isTextLike(contentType)) {
        throw new JiePlatformError(
          "unsupported_content_type",
          `unsupported_content_type: ${contentType}`,
        );
      }

      const arrayBuf = await response.arrayBuffer();
      let bytes = new Uint8Array(arrayBuf);
      let truncated = false;
      if (bytes.length > BODY_CAP) {
        bytes = bytes.subarray(0, BODY_CAP);
        truncated = true;
      }

      const charset = extractCharset(contentType);
      const decoded = decodeBody(bytes, charset);
      const content = isHtml(contentType) ? htmlToText(decoded) : decoded;

      return {
        content,
        details: { status: response.status, truncated },
      };
    },
  };
}
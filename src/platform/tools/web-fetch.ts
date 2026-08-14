import { parse as parseHtml } from "node-html-parser";
import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError } from "../jie-platform-errors";

const WEB_FETCH_DESCRIPTION = `Fetch a URL (http/https only) and return its text content, following redirects.
HTML is reduced to plain text; other text-like types are returned verbatim;
binary types are rejected. Body capped at 5 MiB. 4xx/5xx responses return the
body as a normal result.`;

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

const STRIP_TAGS = ["script", "style", "nav", "header", "footer"];

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
        throw new JiePlatformError("UNSUPPORTED_SCHEME", { detail: input.url });
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new JiePlatformError("UNSUPPORTED_SCHEME", { detail: url.protocol });
      }

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { "User-Agent": USER_AGENT },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new JiePlatformError("REDIRECT_EXHAUSTED", {
          detail: message,
          cause: error instanceof Error ? error : new Error(message),
        });
      }

      const contentType = response.headers.get("content-type") ?? "application/octet-stream";

      if (!isTextLike(contentType)) {
        throw new JiePlatformError("UNSUPPORTED_CONTENT_TYPE", { detail: contentType });
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

function isTextLike(contentType: string): boolean {
  const baseType = contentType.split(";")[0]!.trim().toLowerCase();
  if (TEXT_LIKE_PREFIXES.some((prefix) => baseType.startsWith(prefix))) return true;
  if (TEXT_LIKE_APPLICATIONS.has(baseType)) return true;
  return false;
}

function isHtml(contentType: string): boolean {
  return contentType.split(";")[0]!.trim().toLowerCase() === "text/html";
}

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

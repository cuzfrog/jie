const ALLOWED_HREF_SCHEMES: ReadonlySet<string> = new Set([
  "http:",
  "https:",
  "mailto:",
]);

function isEnabled(): boolean {
  return process.env.INK_OSC8 === "1";
}

function isSafeHref(href: string): boolean {
  if (href.length === 0) return false;
  for (let i = 0; i < href.length; i += 1) {
    const code = href.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x80 && code <= 0x9f) || code === 0x7f) return false;
  }
  const colon = href.indexOf(":");
  if (colon === -1) return true;
  const scheme = href.slice(0, colon + 1).toLowerCase();
  return ALLOWED_HREF_SCHEMES.has(scheme);
}

function escapeOscParam(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i]!;
    const code = value.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x80 && code <= 0x9f) || code === 0x7f) {
      const hex = code.toString(16).padStart(4, "0");
      out += `\\u${hex}`;
    } else if (ch === "\\") {
      out += "\\\\";
    } else {
      out += ch;
    }
  }
  return out;
}

export function formatOsc8(href: string, label: string): string {
  if (!isEnabled() || !isSafeHref(href)) {
    return `${label} (${href})`;
  }
  const safe = escapeOscParam(href);
  return `\x1b]8;;${safe}\x1b\\${label}\x1b]8;;\x1b\\`;
}

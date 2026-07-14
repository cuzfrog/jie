function isEnabled(): boolean {
  return process.env.INK_OSC8 === "1";
}

function escapeOscParam(value: string): string {
  return value.replace(//g, "\\u0007");
}

export function formatOsc8(href: string, label: string): string {
  if (!isEnabled()) {
    return `${label} (${href})`;
  }
  const safe = escapeOscParam(href);
  return `]8;;${safe}\\${label}]8;;\\`;
}

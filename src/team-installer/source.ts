export type TeamSource =
  | { readonly kind: "npm"; readonly spec: string }
  | { readonly kind: "git"; readonly url: string; readonly ref: string | undefined }
  | { readonly kind: "file"; readonly path: string };

export function parseTeamSource(spec: string): TeamSource {
  const trimmed = spec.trim();
  if (trimmed === "") throw new Error("empty team source");
  if (isFilePath(trimmed)) return { kind: "file", path: trimmed };
  if (isGitSpec(trimmed)) return toGitSource(trimmed);
  return { kind: "npm", spec: trimmed };
}

export interface NpmSpec {
  readonly name: string;
  readonly versionRange: string;
}

export function parseNpmSpec(spec: string): NpmSpec {
  const at = spec.lastIndexOf("@");
  if (at <= 0) return { name: spec, versionRange: "latest" };
  return { name: spec.slice(0, at), versionRange: spec.slice(at + 1) };
}

function isFilePath(spec: string): boolean {
  return spec.startsWith("./") || spec.startsWith("../") || spec.startsWith("/") || spec.startsWith("~/");
}

function isGitSpec(spec: string): boolean {
  return (
    spec.startsWith("github:")
    || spec.startsWith("git+")
    || spec.startsWith("git@")
    || spec.startsWith("http://")
    || spec.startsWith("https://")
    || spec.startsWith("ssh://")
    || spec.endsWith(".git")
  );
}

function toGitSource(spec: string): TeamSource {
  const [location, ref] = splitRef(spec);
  return { kind: "git", url: normalizeGitUrl(location), ref };
}

function splitRef(spec: string): readonly [string, string | undefined] {
  const hash = spec.indexOf("#");
  if (hash === -1) return [spec, undefined];
  return [spec.slice(0, hash), spec.slice(hash + 1)];
}

function normalizeGitUrl(location: string): string {
  if (location.startsWith("github:")) {
    return `https://github.com/${location.slice("github:".length)}.git`;
  }
  return location;
}

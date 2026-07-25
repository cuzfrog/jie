export type DescriptorSuffix = "namespace" | "type" | "term" | "method" | "typeParameter" | "parameter" | "meta" | "macro";

export interface ParsedDescriptor {
  readonly name: string;
  readonly suffix: DescriptorSuffix;
  readonly disambiguator: string;
}

export interface ParsedSymbol {
  readonly isLocal: boolean;
  readonly scheme: string;
  readonly manager: string;
  readonly packageName: string;
  readonly version: string;
  readonly descriptors: ReadonlyArray<ParsedDescriptor>;
  readonly displayName: string;
  readonly suffix: DescriptorSuffix | null;
  readonly enclosing: string;
}

export function parseSymbol(symbol: string): ParsedSymbol {
  if (symbol.startsWith(LOCAL_PREFIX)) {
    const localId = symbol.slice(LOCAL_PREFIX.length);
    return { isLocal: true, scheme: "local", manager: "", packageName: "", version: "", descriptors: [], displayName: localId, suffix: null, enclosing: "" };
  }
  const scheme = readToken(symbol, 0);
  const manager = readToken(symbol, scheme.next);
  const packageName = readToken(symbol, manager.next);
  const version = readToken(symbol, packageName.next);
  const descriptors: ParsedDescriptor[] = [];
  let cursor = version.next;
  let lastDescriptorStart = cursor;
  while (cursor < symbol.length) {
    lastDescriptorStart = cursor;
    const read = readDescriptor(symbol, cursor);
    descriptors.push(read.descriptor);
    cursor = read.next;
  }
  const last = descriptors[descriptors.length - 1];
  return {
    isLocal: false,
    scheme: scheme.value,
    manager: placeholderToEmpty(manager.value),
    packageName: placeholderToEmpty(packageName.value),
    version: placeholderToEmpty(version.value),
    descriptors,
    displayName: last !== undefined ? last.name : "",
    suffix: last !== undefined ? last.suffix : null,
    enclosing: symbol.slice(0, lastDescriptorStart),
  };
}

const LOCAL_PREFIX = "local ";
const SUFFIX_CHARS = { "/": "namespace", "#": "type", ".": "term", ":": "meta", "!": "macro" } as const;
const SIMPLE_IDENTIFIER_CHAR = /^[A-Za-z0-9_+$-]$/;

function readToken(source: string, start: number): { value: string; next: number } {
  let value = "";
  let i = start;
  while (i < source.length) {
    const char = source[i];
    if (char === " ") {
      if (source[i + 1] === " ") {
        value += " ";
        i += 2;
        continue;
      }
      return { value, next: i + 1 };
    }
    value += char;
    i += 1;
  }
  return { value, next: i };
}

function readDescriptor(source: string, start: number): { descriptor: ParsedDescriptor; next: number } {
  const char = source[start];
  if (char === "(") {
    const close = source.indexOf(")", start);
    const name = readName(source, start + 1).name;
    return { descriptor: { name, suffix: "parameter", disambiguator: "" }, next: close + 1 };
  }
  if (char === "[") {
    const close = source.indexOf("]", start);
    const name = readName(source, start + 1).name;
    return { descriptor: { name, suffix: "typeParameter", disambiguator: "" }, next: close + 1 };
  }
  const name = readName(source, start);
  const suffixChar = source[name.next];
  if (suffixChar === "(") {
    const close = source.indexOf(")", name.next);
    const disambiguator = source.slice(name.next + 1, close);
    const next = source[close + 1] === "." ? close + 2 : close + 1;
    return { descriptor: { name: name.name, suffix: "method", disambiguator }, next };
  }
  const suffix = SUFFIX_CHARS[suffixChar as keyof typeof SUFFIX_CHARS];
  return { descriptor: { name: name.name, suffix: suffix ?? "term", disambiguator: "" }, next: name.next + 1 };
}

function readName(source: string, start: number): { name: string; next: number } {
  if (source[start] === "`") {
    let name = "";
    let i = start + 1;
    while (i < source.length) {
      if (source[i] === "`") {
        if (source[i + 1] === "`") {
          name += "`";
          i += 2;
          continue;
        }
        return { name, next: i + 1 };
      }
      name += source[i];
      i += 1;
    }
    return { name, next: i };
  }
  let i = start;
  while (i < source.length && SIMPLE_IDENTIFIER_CHAR.test(source[i])) i += 1;
  return { name: source.slice(start, i), next: i };
}

function placeholderToEmpty(token: string): string {
  return token === "." ? "" : token;
}

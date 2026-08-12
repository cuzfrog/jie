import { parseModelRef } from "../platform";

export interface ParsedArgsMap {
  readonly print: {
    readonly kind: "print";
    readonly instruction: string;
    readonly team?: string;
    readonly timeout: number;
    readonly json: boolean;
    readonly apiKey?: string;
    readonly resume?: string;
    readonly inMemory: boolean;
    readonly debug: boolean;
  };
  readonly version: { readonly kind: "version" };
  readonly help: { readonly kind: "help" };
  readonly login: { readonly kind: "login"; readonly provider?: string; readonly apiKey?: string };
  readonly logout: { readonly kind: "logout"; readonly provider?: string };
  readonly model: { readonly kind: "model"; readonly provider: string; readonly modelId: string };
  readonly team:
    | { readonly kind: "team"; readonly action: "info" }
    | { readonly kind: "team"; readonly action: "setDefault"; readonly teamId: string }
    | { readonly kind: "team"; readonly action: "add"; readonly source: string; readonly project: boolean; readonly force: boolean }
    | { readonly kind: "team"; readonly action: "list" }
    | { readonly kind: "team"; readonly action: "remove"; readonly teamId: string; readonly project: boolean };
  readonly apiKey: { readonly kind: "apiKey"; readonly apiKey: string };
  readonly tui: {
    readonly kind: "tui";
    readonly team?: string;
    readonly resume?: string;
    readonly inMemory: boolean;
    readonly debug: boolean;
    readonly noInstall: boolean;
  };
  readonly error: { readonly kind: "error"; readonly message: string };
}
export type ParsedArgs = ParsedArgsMap[keyof ParsedArgsMap];

const PRINT_FLAGS = new Set(["-p", "--print"]);

export function parseFlags(argv: string[]): ParsedArgs {
  const dupes = new Set<string>();
  const seen = new Map<string, string>();

  let debug = false;
  let noInstall = false;
  const rest = argv.slice();
  if (rest.length === 0) return { kind: "tui", inMemory: false, debug, noInstall };
  let first = rest[0]!;
  while (first === "--debug" || first === "--no-install") {
    if (first === "--debug") {
      if (debug) dupes.add("--debug");
      debug = true;
    } else {
      if (noInstall) dupes.add("--no-install");
      noInstall = true;
    }
    rest.shift();
    if (rest.length === 0) {
      const dupErr = errorIfDupes(dupes);
      if (dupErr !== undefined) return dupErr;
      return { kind: "tui", inMemory: false, debug, noInstall };
    }
    first = rest[0]!;
  }
  const dupErr = errorIfDupes(dupes);
  if (dupErr !== undefined) return dupErr;

  if (first === "--version") return { kind: "version" };
  if (first === "--help" || first === "-h") return { kind: "help" };
  if (first === "--in-memory") {
    seen.set("--in-memory", "");
    const tail = rest.slice(1);
    let j = 0;
    while (j < tail.length && (tail[j] === "--debug" || tail[j] === "--no-install")) {
      const f = tail[j]!;
      if (f === "--debug") {
        if (seen.has("--debug")) dupes.add("--debug");
        seen.set("--debug", "");
        debug = true;
      } else {
        if (seen.has("--no-install")) dupes.add("--no-install");
        seen.set("--no-install", "");
        noInstall = true;
      }
      j += 1;
    }
    const remaining = tail.slice(j);
    if (remaining.length === 0) {
      const dupErr = errorIfDupes(dupes);
      if (dupErr !== undefined) return dupErr;
      return { kind: "tui", inMemory: true, debug, noInstall };
    }
    const head = remaining[0]!;
    if (head === "-p" || head === "--print" || head === "--in-memory") {
      return parsePrint(remaining, dupes, seen, head, true, debug, noInstall);
    }
    if (head === "--api-key" || head === "--resume" || head === "--team") {
      if (remaining.length < 2) {
        return { kind: "error", message: `missing argument for ${head}` };
      }
      return parsePrint(remaining.slice(1), dupes, seen, head, true, debug, noInstall);
    }
    if (head.startsWith("-")) {
      return { kind: "error", message: `unknown flag: ${head}` };
    }
    return { kind: "tui", team: head, inMemory: true, debug, noInstall };
  }
  if (first === "login") return parseLogin(rest.slice(1), dupes, seen);
  if (first === "logout") return parseLogout(rest.slice(1), dupes, seen);
  if (first === "model") return parseModel(rest.slice(1));
  if (first === "team") return parseTeam(rest.slice(1));

  if (first === "--api-key") {
    const v = rest[1];
    if (v === undefined) return { kind: "error", message: "missing argument for --api-key" };
    if (rest.length > 2) {

      return parsePrint(rest.slice(1), dupes, seen, first, false, debug, noInstall);
    }
    return { kind: "apiKey", apiKey: v };
  }
  if (PRINT_FLAGS.has(first)) {
    return parsePrint(rest.slice(1), dupes, seen, first, false, debug, noInstall);
  }
  if (first === "--resume") {
    return parsePrint(rest.slice(1), dupes, seen, first, false, debug, noInstall);
  }
  if (first === "--team") {
    return parsePrint(rest.slice(1), dupes, seen, first, false, debug, noInstall);
  }
  if (first.startsWith("-")) {
    return { kind: "error", message: `unknown flag: ${first}` };
  }
  return { kind: "error", message: `unknown subcommand: ${first}` };
}

function errorIfDupes(
  dupes: Set<string>,
): { kind: "error"; message: string } | undefined {
  if (dupes.size === 0) return undefined;
  const first = [...dupes][0]!;
  return { kind: "error", message: `duplicate flag: ${first}` };
}

function parseLogin(
  args: string[],
  dupes: Set<string>,
  _seen: Map<string, string>,
): ParsedArgs {
  let provider: string | undefined;
  let apiKey: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (a === "--provider") {
      provider = args[i + 1];
      i += 1;
    } else if (a === "--api-key") {
      apiKey = args[i + 1];
      i += 1;
    } else {
      return { kind: "error", message: `unknown flag: ${a}` };
    }
  }
  const dupErr = errorIfDupes(dupes);
  if (dupErr !== undefined) return dupErr;
  return { kind: "login", provider, apiKey };
}

function parseLogout(
  args: string[],
  _dupes: Set<string>,
  _seen: Map<string, string>,
): ParsedArgs {
  const provider = args[0];
  if (provider !== undefined && provider.startsWith("-")) {
    return { kind: "error", message: `unknown flag: ${provider}` };
  }
  return { kind: "logout", provider };
}

function parseModel(args: string[]): ParsedArgs {
  if (args.length === 0) {
    return { kind: "error", message: "missing argument for model" };
  }
  const first = args[0]!;
  const parsed = parseModelRef(first);
  if (parsed === null) return { kind: "error", message: `invalid model string: ${first}` };
  return { kind: "model", provider: parsed.provider, modelId: parsed.modelId };
}

function parseTeam(args: string[]): ParsedArgs {
  if (args.length === 0) return { kind: "team", action: "info" };
  const first = args[0]!;
  if (first === "add") return parseTeamAdd(args.slice(1));
  if (first === "list") return parseTeamList(args.slice(1));
  if (first === "remove") return parseTeamRemove(args.slice(1));
  if (first.startsWith("-")) return { kind: "error", message: `unknown flag: ${first}` };
  return { kind: "team", action: "setDefault", teamId: first };
}

function parseTeamAdd(args: string[]): ParsedArgs {
  let project = false;
  let force = false;
  let source: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (a === "--project") {
      project = true;
      continue;
    }
    if (a === "--force") {
      force = true;
      continue;
    }
    if (a.startsWith("-")) return { kind: "error", message: `unknown flag: ${a}` };
    if (source !== undefined) return { kind: "error", message: `unexpected argument: ${a}` };
    source = a;
  }
  if (source === undefined) return { kind: "error", message: "missing source for 'jie team add'" };
  return { kind: "team", action: "add", source, project, force };
}

function parseTeamList(args: string[]): ParsedArgs {
  if (args.length > 0) return { kind: "error", message: `unexpected argument: ${args[0]}` };
  return { kind: "team", action: "list" };
}

function parseTeamRemove(args: string[]): ParsedArgs {
  let project = false;
  let teamId: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (a === "--project") {
      project = true;
      continue;
    }
    if (a.startsWith("-")) return { kind: "error", message: `unknown flag: ${a}` };
    if (teamId !== undefined) return { kind: "error", message: `unexpected argument: ${a}` };
    teamId = a;
  }
  if (teamId === undefined) return { kind: "error", message: "missing team id for 'jie team remove'" };
  return { kind: "team", action: "remove", teamId, project };
}

function parsePrint(
  args: string[],
  dupes: Set<string>,
  seen: Map<string, string>,
  firstFlag: string,
  inMemory = false,
  debug = false,
  noInstall = false,
): ParsedArgs {
  let team: string | undefined;
  let timeout: number | undefined;
  let json = false;
  let apiKey: string | undefined;
  let resume: string | undefined;
  let instruction: string | undefined;
  let i = 0;
  if (firstFlag === "-p" || firstFlag === "--print" || firstFlag === "--api-key") {
    if (firstFlag === "--api-key") {
      if (args[i] === undefined) {
        return { kind: "error", message: "missing argument for --api-key" };
      }
      apiKey = args[i]!;
      i += 1;
    } else {

      seen.set(firstFlag, "");
    }
  } else if (firstFlag === "--resume") {
    if (args[i] === undefined) {
      return { kind: "error", message: "missing argument for --resume" };
    }
    resume = args[i]!;
    i += 1;
    seen.set("--resume", resume);
  } else if (firstFlag === "--team") {
    if (args[i] === undefined) {
      return { kind: "error", message: "missing argument for --team" };
    }
    team = args[i]!;
    i += 1;
    seen.set("--team", team);
  }
  for (; i < args.length; i += 1) {
    const a = args[i]!;
    if (a === "-p" || a === "--print") {
      seen.set(a, "");
      continue;
    }
    if (a === "--in-memory") {
      if (seen.has("--in-memory")) dupes.add("--in-memory");
      seen.set("--in-memory", "");
      inMemory = true;
      continue;
    }
    if (a === "--team") {
      const v = args[i + 1];
      if (v === undefined) return { kind: "error", message: "missing argument for --team" };
      if (seen.has("--team")) dupes.add("--team");
      seen.set("--team", v);
      team = v;
      i += 1;
      continue;
    }
    if (a === "--timeout") {
      const v = args[i + 1];
      if (v === undefined) return { kind: "error", message: "missing argument for --timeout" };
      if (seen.has("--timeout")) dupes.add("--timeout");
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        return { kind: "error", message: `invalid --timeout value: ${v} (must be > 0)` };
      }
      seen.set("--timeout", String(n));
      timeout = n;
      i += 1;
      continue;
    }
    if (a === "--json") {
      if (seen.has("--json")) dupes.add("--json");
      seen.set("--json", "");
      json = true;
      continue;
    }
    if (a === "--api-key") {
      const v = args[i + 1];
      if (v === undefined) return { kind: "error", message: "missing argument for --api-key" };
      if (seen.has("--api-key")) dupes.add("--api-key");
      seen.set("--api-key", v);
      apiKey = v;
      i += 1;
      continue;
    }
    if (a === "--resume") {
      const v = args[i + 1];
      if (v === undefined) return { kind: "error", message: "missing argument for --resume" };
      if (seen.has("--resume")) dupes.add("--resume");
      seen.set("--resume", v);
      resume = v;
      i += 1;
      continue;
    }
    if (a === "--debug") {
      if (seen.has("--debug")) dupes.add("--debug");
      seen.set("--debug", "");
      debug = true;
      continue;
    }
    if (a === "--no-install") {
      if (seen.has("--no-install")) dupes.add("--no-install");
      seen.set("--no-install", "");
      noInstall = true;
      continue;
    }
    if (a.startsWith("-")) {
      return { kind: "error", message: `unknown flag: ${a}` };
    }
    if (instruction === undefined) {
      instruction = a;
    } else {
      return { kind: "error", message: `unexpected positional argument: ${a}` };
    }
  }
  const dupErr = errorIfDupes(dupes);
  if (dupErr !== undefined) return dupErr;
  if (instruction === undefined) {
    const printRequested = seen.has("-p") || seen.has("--print");
    const printOnlyFlags = apiKey !== undefined || timeout !== undefined || json;
    if (!printRequested && !printOnlyFlags && (team !== undefined || resume !== undefined)) {
      return { kind: "tui", team, resume, inMemory, debug, noInstall };
    }
    return { kind: "error", message: "missing instruction for -p/--print" };
  }
  return {
    kind: "print",
    instruction,
    team,
    timeout: timeout ?? 300,
    json,
    apiKey,
    resume,
    inMemory,
    debug,
  };
}

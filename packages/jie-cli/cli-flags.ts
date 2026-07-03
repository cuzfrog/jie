
export interface ParsedArgsMap {
  readonly print: {
    readonly kind: "print";
    readonly instruction: string;
    readonly team?: string;
    readonly timeout: number;
    readonly json: boolean;
    readonly apiKey?: string;
    readonly resume?: string;
    readonly continueLast: boolean;
  };
  readonly version: { readonly kind: "version" };
  readonly help: { readonly kind: "help" };
  readonly login: { readonly kind: "login"; readonly provider?: string; readonly apiKey?: string };
  readonly logout: { readonly kind: "logout"; readonly provider?: string };
  readonly model: { readonly kind: "model"; readonly provider: string; readonly modelId: string };
  readonly team: { readonly kind: "team"; readonly teamId?: string; readonly unset: boolean };
  readonly apiKey: { readonly kind: "apiKey"; readonly apiKey: string };
  readonly tui: { readonly kind: "tui"; readonly team?: string };
  readonly error: { readonly kind: "error"; readonly message: string };
}
export type ParsedArgs = ParsedArgsMap[keyof ParsedArgsMap];

const PRINT_FLAGS = new Set(["-p", "--print"]);

export function parseFlags(argv: string[]): ParsedArgs {
  const dupes = new Set<string>();
  const seen = new Map<string, string>();

  const rest = argv.slice();
  if (rest.length === 0) return { kind: "tui" };
  const first = rest[0]!;

  if (first === "--version") return { kind: "version" };
  if (first === "--help" || first === "-h") return { kind: "help" };
  if (first === "login") return parseLogin(rest.slice(1), dupes, seen);
  if (first === "logout") return parseLogout(rest.slice(1), dupes, seen);
  if (first === "model") return parseModel(rest.slice(1));
  if (first === "team") return parseTeam(rest.slice(1));

  if (first === "--api-key") {
    const v = rest[1];
    if (v === undefined) return { kind: "error", message: "missing argument for --api-key" };
    if (rest.length > 2) {

      return parsePrint(rest.slice(1), dupes, seen, first);
    }
    return { kind: "apiKey", apiKey: v };
  }
  if (PRINT_FLAGS.has(first)) {
    return parsePrint(rest.slice(1), dupes, seen, first);
  }
  if (first === "--resume" || first === "--continue") {
    return parsePrint(rest.slice(1), dupes, seen, first);
  }
  if (first === "--team") {
    return parsePrint(rest.slice(1), dupes, seen, first);
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
  const slash = first.indexOf("/");
  if (slash === -1) {
    return { kind: "error", message: `invalid model string: ${first}` };
  }
  const provider = first.slice(0, slash);
  const modelId = first.slice(slash + 1);
  if (provider === "" || modelId === "") {
    return { kind: "error", message: `invalid model string: ${first}` };
  }
  return { kind: "model", provider, modelId };
}

function parseTeam(args: string[]): ParsedArgs {
  if (args.length === 0) return { kind: "team", unset: false };
  if (args[0] === "--unset") return { kind: "team", unset: true };
  if (args[0]!.startsWith("-")) {
    return { kind: "error", message: `unknown flag: ${args[0]}` };
  }
  return { kind: "team", teamId: args[0], unset: false };
}

function parsePrint(
  args: string[],
  dupes: Set<string>,
  seen: Map<string, string>,
  firstFlag: string,
): ParsedArgs {
  let team: string | undefined;
  let timeout: number | undefined;
  let json = false;
  let apiKey: string | undefined;
  let resume: string | undefined;
  let continueLast = false;
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
  } else if (firstFlag === "--continue") {
    continueLast = true;
    seen.set("--continue", "");
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
    if (a === "--continue") {
      if (seen.has("--continue")) dupes.add("--continue");
      seen.set("--continue", "");
      continueLast = true;
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
  if (resume !== undefined && continueLast) {
    return { kind: "error", message: "cannot use --resume and --continue together" };
  }
  if (instruction === undefined) {
    return { kind: "error", message: "missing instruction for -p/--print" };
  }
  const dupErr = errorIfDupes(dupes);
  if (dupErr !== undefined) return dupErr;
  return {
    kind: "print",
    instruction,
    team,
    timeout: timeout ?? 300,
    json,
    apiKey,
    resume,
    continueLast,
  };
}

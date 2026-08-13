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

type ParseContext = {
  readonly args: readonly string[];
  index: number;
  seen: Set<string>;
  dupes: Set<string>;
  debug: boolean;
  noInstall: boolean;
  inMemory: boolean;
};

export function parseFlags(argv: string[]): ParsedArgs {
  const ctx: ParseContext = { args: argv, index: 0, seen: new Set(), dupes: new Set(), debug: false, noInstall: false, inMemory: false };
  consumeLeadingGlobalFlags(ctx);
  const dupErr = errorIfDupes(ctx.dupes);
  if (dupErr !== undefined) return dupErr;

  if (ctx.index >= ctx.args.length) {
    return { kind: "tui", inMemory: ctx.inMemory, debug: ctx.debug, noInstall: ctx.noInstall };
  }

  const first = ctx.args[ctx.index]!;
  if (first === "--version") return { kind: "version" };
  if (first === "--help" || first === "-h") return { kind: "help" };
  if (first === "login") { ctx.index += 1; return parseLogin(ctx); }
  if (first === "logout") { ctx.index += 1; return parseLogout(ctx); }
  if (first === "model") { ctx.index += 1; return parseModel(ctx); }
  if (first === "team") { ctx.index += 1; return parseTeam(ctx); }

  if (first === "--in-memory") {
    recordFlag(ctx, "--in-memory");
    ctx.inMemory = true;
    ctx.index += 1;
    return parseRun(ctx);
  }
  if (first.startsWith("-")) return parseRun(ctx);

  return error(`unknown subcommand: ${first}`);
}

function consumeLeadingGlobalFlags(ctx: ParseContext): void {
  while (ctx.index < ctx.args.length) {
    const a = ctx.args[ctx.index]!;
    if (a === "--debug") {
      recordFlag(ctx, "--debug");
      ctx.debug = true;
      ctx.index += 1;
      continue;
    }
    if (a === "--no-install") {
      recordFlag(ctx, "--no-install");
      ctx.noInstall = true;
      ctx.index += 1;
      continue;
    }
    break;
  }
}

function recordFlag(ctx: ParseContext, name: string): void {
  if (ctx.seen.has(name)) ctx.dupes.add(name);
  ctx.seen.add(name);
}

function errorIfDupes(dupes: Set<string>): ParsedArgs | undefined {
  if (dupes.size === 0) return undefined;
  const first = [...dupes][0]!;
  return { kind: "error", message: `duplicate flag: ${first}` };
}

function error(message: string): ParsedArgs {
  return { kind: "error", message };
}

function parseRun(ctx: ParseContext): ParsedArgs {
  const first = ctx.args[ctx.index];
  if (first === "--json" || first === "--timeout") {
    return error(`unknown flag: ${first}`);
  }

  let team: string | undefined;
  let resume: string | undefined;
  let apiKey: string | undefined;
  let timeout: number | undefined;
  let json = false;
  let instruction: string | undefined;
  let printRequested = false;

  while (ctx.index < ctx.args.length) {
    const a = ctx.args[ctx.index]!;
    if (a === "-p" || a === "--print") {
      recordFlag(ctx, a);
      printRequested = true;
      ctx.index += 1;
      continue;
    }
    if (a === "--in-memory") {
      recordFlag(ctx, "--in-memory");
      ctx.inMemory = true;
      ctx.index += 1;
      continue;
    }
    if (a === "--debug") {
      recordFlag(ctx, "--debug");
      ctx.debug = true;
      ctx.index += 1;
      continue;
    }
    if (a === "--no-install") {
      recordFlag(ctx, "--no-install");
      ctx.noInstall = true;
      ctx.index += 1;
      continue;
    }
    if (a === "--json") {
      recordFlag(ctx, "--json");
      json = true;
      ctx.index += 1;
      continue;
    }
    if (a === "--team") {
      recordFlag(ctx, "--team");
      ctx.index += 1;
      const v = ctx.args[ctx.index];
      if (v === undefined) return error("missing argument for --team");
      team = v;
      ctx.index += 1;
      continue;
    }
    if (a === "--resume") {
      recordFlag(ctx, "--resume");
      ctx.index += 1;
      const v = ctx.args[ctx.index];
      if (v === undefined) return error("missing argument for --resume");
      resume = v;
      ctx.index += 1;
      continue;
    }
    if (a === "--api-key") {
      recordFlag(ctx, "--api-key");
      ctx.index += 1;
      const v = ctx.args[ctx.index];
      if (v === undefined) return error("missing argument for --api-key");
      apiKey = v;
      ctx.index += 1;
      continue;
    }
    if (a === "--timeout") {
      recordFlag(ctx, "--timeout");
      ctx.index += 1;
      const v = ctx.args[ctx.index];
      if (v === undefined) return error("missing argument for --timeout");
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return error(`invalid --timeout value: ${v} (must be > 0)`);
      timeout = n;
      ctx.index += 1;
      continue;
    }
    if (a.startsWith("-")) return error(`unknown flag: ${a}`);

    if (instruction !== undefined) return error(`unexpected positional argument: ${a}`);
    if (printRequested || team !== undefined || resume !== undefined) {
      instruction = a;
    } else {
      team = a;
    }
    ctx.index += 1;
  }

  const dupErr = errorIfDupes(ctx.dupes);
  if (dupErr !== undefined) return dupErr;

  if (instruction === undefined) {
    const printOnly = apiKey !== undefined || timeout !== undefined || json;
    if (!printRequested && !printOnly && (team !== undefined || resume !== undefined || ctx.inMemory)) {
      return { kind: "tui", team, resume, inMemory: ctx.inMemory, debug: ctx.debug, noInstall: ctx.noInstall };
    }
    if (apiKey !== undefined && !printRequested && !json && timeout === undefined && team === undefined && resume === undefined && !ctx.inMemory) {
      return { kind: "apiKey", apiKey };
    }
    return error("missing instruction for -p/--print");
  }

  return {
    kind: "print",
    instruction,
    team,
    timeout: timeout ?? 300,
    json,
    apiKey,
    resume,
    inMemory: ctx.inMemory,
    debug: ctx.debug,
  };
}

function parseLogin(ctx: ParseContext): ParsedArgs {
  let provider: string | undefined;
  let apiKey: string | undefined;
  while (ctx.index < ctx.args.length) {
    const a = ctx.args[ctx.index]!;
    if (a === "--provider") {
      recordFlag(ctx, "--provider");
      ctx.index += 1;
      const v = ctx.args[ctx.index];
      if (v === undefined) return error("missing argument for --provider");
      provider = v;
      ctx.index += 1;
      continue;
    }
    if (a === "--api-key") {
      recordFlag(ctx, "--api-key");
      ctx.index += 1;
      const v = ctx.args[ctx.index];
      if (v === undefined) return error("missing argument for --api-key");
      apiKey = v;
      ctx.index += 1;
      continue;
    }
    if (a.startsWith("-")) return error(`unknown flag: ${a}`);
    return error(`unexpected argument: ${a}`);
  }
  const dupErr = errorIfDupes(ctx.dupes);
  if (dupErr !== undefined) return dupErr;
  return { kind: "login", provider, apiKey };
}

function parseLogout(ctx: ParseContext): ParsedArgs {
  const provider = ctx.args[ctx.index];
  if (provider !== undefined && provider.startsWith("-")) return error(`unknown flag: ${provider}`);
  return { kind: "logout", provider };
}

function parseModel(ctx: ParseContext): ParsedArgs {
  if (ctx.index >= ctx.args.length) return error("missing argument for model");
  const raw = ctx.args[ctx.index]!;
  const parsed = parseModelRef(raw);
  if (parsed === null) return error(`invalid model string: ${raw}`);
  return { kind: "model", provider: parsed.provider, modelId: parsed.modelId };
}

function parseTeam(ctx: ParseContext): ParsedArgs {
  if (ctx.index >= ctx.args.length) return { kind: "team", action: "info" };
  const first = ctx.args[ctx.index]!;
  if (first === "add") { ctx.index += 1; return parseTeamAdd(ctx); }
  if (first === "list") { ctx.index += 1; return parseTeamList(ctx); }
  if (first === "remove") { ctx.index += 1; return parseTeamRemove(ctx); }
  if (first.startsWith("-")) return error(`unknown flag: ${first}`);
  return { kind: "team", action: "setDefault", teamId: first };
}

function parseTeamAdd(ctx: ParseContext): ParsedArgs {
  let project = false;
  let force = false;
  let source: string | undefined;
  while (ctx.index < ctx.args.length) {
    const a = ctx.args[ctx.index]!;
    if (a === "--project") {
      recordFlag(ctx, "--project");
      project = true;
      ctx.index += 1;
      continue;
    }
    if (a === "--force") {
      recordFlag(ctx, "--force");
      force = true;
      ctx.index += 1;
      continue;
    }
    if (a.startsWith("-")) return error(`unknown flag: ${a}`);
    if (source !== undefined) return error(`unexpected argument: ${a}`);
    source = a;
    ctx.index += 1;
  }
  const dupErr = errorIfDupes(ctx.dupes);
  if (dupErr !== undefined) return dupErr;
  if (source === undefined) return error("missing source for 'jie team add'");
  return { kind: "team", action: "add", source, project, force };
}

function parseTeamList(ctx: ParseContext): ParsedArgs {
  if (ctx.index < ctx.args.length) return error(`unexpected argument: ${ctx.args[ctx.index]}`);
  return { kind: "team", action: "list" };
}

function parseTeamRemove(ctx: ParseContext): ParsedArgs {
  let project = false;
  let teamId: string | undefined;
  while (ctx.index < ctx.args.length) {
    const a = ctx.args[ctx.index]!;
    if (a === "--project") {
      recordFlag(ctx, "--project");
      project = true;
      ctx.index += 1;
      continue;
    }
    if (a.startsWith("-")) return error(`unknown flag: ${a}`);
    if (teamId !== undefined) return error(`unexpected argument: ${a}`);
    teamId = a;
    ctx.index += 1;
  }
  const dupErr = errorIfDupes(ctx.dupes);
  if (dupErr !== undefined) return dupErr;
  if (teamId === undefined) return error("missing team id for 'jie team remove'");
  return { kind: "team", action: "remove", teamId, project };
}

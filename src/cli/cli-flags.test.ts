import { parseFlags } from "./cli-flags";

describe("parseFlags — help / version", () => {
  test("no args -> tui (TUI not implemented in v1)", () => {
    expect(parseFlags([])).toEqual({ kind: "tui", inMemory: false, debug: false, noInstall: false });
  });

  test("--help -> help", () => {
    expect(parseFlags(["--help"])).toEqual({ kind: "help" });
  });

  test("--version -> version", () => {
    expect(parseFlags(["--version"])).toEqual({ kind: "version" });
  });
});

describe("parseFlags — login", () => {
  test("login --provider anthropic --api-key k", () => {
    expect(parseFlags(["login", "--provider", "anthropic", "--api-key", "k"])).toEqual({
      kind: "login",
      provider: "anthropic",
      apiKey: "k",
    });
  });

  test("login with no flags -> error (interactive not in v1)", () => {
    expect(parseFlags(["login"])).toEqual({ kind: "login", provider: undefined, apiKey: undefined });
  });
});

describe("parseFlags — logout", () => {
  test("logout anthropic", () => {
    expect(parseFlags(["logout", "anthropic"])).toEqual({
      kind: "logout",
      provider: "anthropic",
    });
  });

  test("logout (no provider)", () => {
    expect(parseFlags(["logout"])).toEqual({ kind: "logout", provider: undefined });
  });

  test("logout rejects an extra argument", () => {
    expect(parseFlags(["logout", "anthropic", "extra"])).toEqual({ kind: "error", message: "unexpected argument: extra" });
  });

  test("logout rejects an unknown flag after the subcommand", () => {
    expect(parseFlags(["logout", "--debug"])).toEqual({ kind: "error", message: "unknown flag: --debug" });
  });
});

describe("parseFlags — model", () => {
  test("model anthropic/claude-sonnet-4", () => {
    expect(parseFlags(["model", "anthropic/claude-sonnet-4"])).toEqual({
      kind: "model",
      provider: "anthropic",
      modelId: "claude-sonnet-4",
    });
  });

  test("model openai/gpt-4o", () => {
    expect(parseFlags(["model", "openai/gpt-4o"])).toEqual({
      kind: "model",
      provider: "openai",
      modelId: "gpt-4o",
    });
  });

  test("model with no arg -> error", () => {
    expect(parseFlags(["model"])).toEqual({ kind: "error", message: "missing argument for model" });
  });

  test("model with malformed arg -> error", () => {
    expect(parseFlags(["model", "no-slash"])).toEqual({ kind: "error", message: "invalid model string: no-slash" });
  });
});

describe("parseFlags — team", () => {
  test("team dev -> set default team", () => {
    expect(parseFlags(["team", "dev"])).toEqual({ kind: "team", action: "setDefault", teamId: "dev" });
  });

  test("team (no arg) -> info", () => {
    expect(parseFlags(["team"])).toEqual({ kind: "team", action: "info" });
  });

  test("team --unset -> unknown flag error", () => {
    expect(parseFlags(["team", "--unset"])).toEqual({ kind: "error", message: "unknown flag: --unset" });
  });

  test("team add <source> -> add to global scope", () => {
    expect(parseFlags(["team", "add", "@cuzfrog/jie-team"])).toEqual({
      kind: "team",
      action: "add",
      source: "@cuzfrog/jie-team",
      project: false,
      force: false,
    });
  });

  test("team add <source> --project --force -> add to project scope, overwrite", () => {
    expect(parseFlags(["team", "add", "./teams/dev", "--project", "--force"])).toEqual({
      kind: "team",
      action: "add",
      source: "./teams/dev",
      project: true,
      force: true,
    });
  });

  test("team add without source -> error", () => {
    expect(parseFlags(["team", "add"])).toEqual({ kind: "error", message: "missing source for 'jie team add'" });
  });

  test("team add with unknown flag -> error", () => {
    expect(parseFlags(["team", "add", "src", "--bogus"])).toEqual({ kind: "error", message: "unknown flag: --bogus" });
  });

  test("team list -> list", () => {
    expect(parseFlags(["team", "list"])).toEqual({ kind: "team", action: "list" });
  });

  test("team list with extra arg -> error", () => {
    expect(parseFlags(["team", "list", "x"])).toEqual({ kind: "error", message: "unexpected argument: x" });
  });

  test("team remove <id> -> remove from global scope", () => {
    expect(parseFlags(["team", "remove", "dev"])).toEqual({
      kind: "team",
      action: "remove",
      teamId: "dev",
      project: false,
    });
  });

  test("team remove <id> --project -> remove from project scope", () => {
    expect(parseFlags(["team", "remove", "dev", "--project"])).toEqual({
      kind: "team",
      action: "remove",
      teamId: "dev",
      project: true,
    });
  });

  test("team remove without id -> error", () => {
    expect(parseFlags(["team", "remove"])).toEqual({ kind: "error", message: "missing team id for 'jie team remove'" });
  });
});

describe("parseFlags — -p", () => {
  test("simple -p instruction", () => {
    expect(parseFlags(["-p", "List files"])).toEqual({
      kind: "print",
      instruction: "List files",
      team: undefined,
      timeout: 300,
      json: false,
      apiKey: undefined,
      resume: undefined,
      inMemory: false,
      debug: false,
    });
  });

  test("--print alias", () => {
    expect(parseFlags(["--print", "Do thing"])).toEqual({
      kind: "print",
      instruction: "Do thing",
      team: undefined,
      timeout: 300,
      json: false,
      apiKey: undefined,
      resume: undefined,
      inMemory: false,
      debug: false,
    });
  });

  test("-p with --team", () => {
    expect(parseFlags(["-p", "x", "--team", "alpha"])).toEqual({
      kind: "print",
      instruction: "x",
      team: "alpha",
      timeout: 300,
      json: false,
      apiKey: undefined,
      resume: undefined,
      inMemory: false,
      debug: false,
    });
  });

  test("-p with --timeout", () => {
    expect(parseFlags(["-p", "x", "--timeout", "60"])).toEqual({
      kind: "print",
      instruction: "x",
      team: undefined,
      timeout: 60,
      json: false,
      apiKey: undefined,
      resume: undefined,
      inMemory: false,
      debug: false,
    });
  });

  test("-p rejects --timeout 0 (would hang forever)", () => {
    expect(parseFlags(["-p", "x", "--timeout", "0"])).toEqual({
      kind: "error",
      message: "invalid --timeout value: 0 (must be > 0)",
    });
  });

  test("-p rejects negative --timeout", () => {
    expect(parseFlags(["-p", "x", "--timeout", "-1"])).toEqual({
      kind: "error",
      message: "invalid --timeout value: -1 (must be > 0)",
    });
  });

  test("-p with --json", () => {
    expect(parseFlags(["-p", "x", "--json"])).toMatchObject({ json: true });
  });

  test("-p with --api-key (and -p after)", () => {
    expect(parseFlags(["--api-key", "sk-x", "-p", "fix"])).toEqual({
      kind: "print",
      instruction: "fix",
      team: undefined,
      timeout: 300,
      json: false,
      apiKey: "sk-x",
      resume: undefined,
      inMemory: false,
      debug: false,
    });
  });

  test("-p with --resume", () => {
    expect(parseFlags(["-p", "x", "--resume", "abc"])).toMatchObject({ resume: "abc" });
  });

  test("--continue is rejected as an unknown flag", () => {
    expect(parseFlags(["-p", "x", "--continue"])).toEqual({
      kind: "error",
      message: "unknown flag: --continue",
    });
  });

  test("duplicate --team", () => {
    expect(parseFlags(["-p", "x", "--team", "a", "--team", "b"])).toEqual({
      kind: "error",
      message: "duplicate flag: --team",
    });
  });

  test("duplicate --timeout", () => {
    expect(parseFlags(["-p", "x", "--timeout", "10", "--timeout", "20"])).toEqual({
      kind: "error",
      message: "duplicate flag: --timeout",
    });
  });

  test("missing instruction for -p -> error", () => {
    expect(parseFlags(["-p"])).toEqual({
      kind: "error",
      message: "missing instruction for -p/--print",
    });
  });

  test("missing argument for --team -> error", () => {
    expect(parseFlags(["-p", "x", "--team"])).toEqual({
      kind: "error",
      message: "missing argument for --team",
    });
  });
});

describe("parseFlags — --in-memory", () => {
  test("--in-memory alone -> tui with inMemory true", () => {
    expect(parseFlags(["--in-memory"])).toEqual({ kind: "tui", inMemory: true, debug: false, noInstall: false });
  });

  test("--in-memory followed by positional -> tui with team + inMemory true", () => {
    expect(parseFlags(["--in-memory", "alpha"])).toEqual({
      kind: "tui",
      team: "alpha",
      inMemory: true,
      debug: false,
      noInstall: false,
    });
  });

  test("--in-memory --team <name> -> tui with team + inMemory true", () => {
    expect(parseFlags(["--in-memory", "--team", "alpha"])).toEqual({
      kind: "tui",
      team: "alpha",
      inMemory: true,
      debug: false,
      noInstall: false,
    });
  });

  test("--in-memory --team <name> <instruction> -> print", () => {
    expect(parseFlags(["--in-memory", "--team", "alpha", "do it"])).toEqual({
      kind: "print",
      instruction: "do it",
      team: "alpha",
      timeout: 300,
      json: false,
      apiKey: undefined,
      resume: undefined,
      inMemory: true,
      debug: false,
    });
  });

  test("--in-memory -p <instruction> -> print with inMemory true", () => {
    expect(parseFlags(["--in-memory", "-p", "do it"])).toEqual({
      kind: "print",
      instruction: "do it",
      team: undefined,
      timeout: 300,
      json: false,
      apiKey: undefined,
      resume: undefined,
      inMemory: true,
      debug: false,
    });
  });

  test("--in-memory --print <instruction> -> print with inMemory true", () => {
    expect(parseFlags(["--in-memory", "--print", "do it"])).toEqual({
      kind: "print",
      instruction: "do it",
      team: undefined,
      timeout: 300,
      json: false,
      apiKey: undefined,
      resume: undefined,
      inMemory: true,
      debug: false,
    });
  });

  test("--in-memory -p combined with --team and --json", () => {
    expect(parseFlags(["--in-memory", "-p", "x", "--team", "alpha", "--json"])).toEqual({
      kind: "print",
      instruction: "x",
      team: "alpha",
      timeout: 300,
      json: true,
      apiKey: undefined,
      resume: undefined,
      inMemory: true,
      debug: false,
    });
  });

  test("--in-memory -p with --api-key", () => {
    expect(parseFlags(["--in-memory", "--api-key", "k", "-p", "go"])).toEqual({
      kind: "print",
      instruction: "go",
      team: undefined,
      timeout: 300,
      json: false,
      apiKey: "k",
      resume: undefined,
      inMemory: true,
      debug: false,
    });
  });

  test("--in-memory -p with --resume", () => {
    expect(parseFlags(["--in-memory", "-p", "x", "--resume", "abc"])).toEqual({
      kind: "print",
      instruction: "x",
      team: undefined,
      timeout: 300,
      json: false,
      apiKey: undefined,
      resume: "abc",
      inMemory: true,
      debug: false,
    });
  });

  test("--in-memory as a positional subcommand after -p", () => {
    expect(parseFlags(["-p", "x", "--in-memory"])).toEqual({
      kind: "print",
      instruction: "x",
      team: undefined,
      timeout: 300,
      json: false,
      apiKey: undefined,
      resume: undefined,
      inMemory: true,
      debug: false,
    });
  });

  test("duplicate --in-memory is rejected", () => {
    expect(parseFlags(["-p", "x", "--in-memory", "--in-memory"])).toEqual({
      kind: "error",
      message: "duplicate flag: --in-memory",
    });
  });

  test("--in-memory followed by another unknown flag -> error", () => {
    expect(parseFlags(["--in-memory", "--bogus"])).toEqual({
      kind: "error",
      message: "unknown flag: --bogus",
    });
  });

  test("--in-memory before --version is not supported (--version must be first)", () => {
    expect(parseFlags(["--in-memory", "--version"])).toEqual({
      kind: "error",
      message: "unknown flag: --version",
    });
  });

  test("leading --in-memory followed by another --in-memory is detected as duplicate", () => {
    expect(parseFlags(["--in-memory", "--in-memory", "-p", "x"])).toEqual({
      kind: "error",
      message: "duplicate flag: --in-memory",
    });
  });
});

describe("parseFlags — standalone --team / --resume route to the TUI", () => {
  test("--team <id> alone -> tui for that team", () => {
    expect(parseFlags(["--team", "alpha"])).toEqual({ kind: "tui", team: "alpha", inMemory: false, debug: false, noInstall: false });
  });

  test("--resume <id> alone -> tui resuming the session", () => {
    expect(parseFlags(["--resume", "sess-1"])).toEqual({ kind: "tui", resume: "sess-1", inMemory: false, debug: false, noInstall: false });
  });

  test("--in-memory --resume <id> -> tui in-memory resuming the session", () => {
    expect(parseFlags(["--in-memory", "--resume", "sess-1"])).toEqual({
      kind: "tui",
      resume: "sess-1",
      inMemory: true,
      debug: false,
      noInstall: false,
    });
  });

  test("--resume <id> --in-memory (flag after) -> tui in-memory resuming the session", () => {
    expect(parseFlags(["--resume", "sess-1", "--in-memory"])).toEqual({
      kind: "tui",
      resume: "sess-1",
      inMemory: true,
      debug: false,
      noInstall: false,
    });
  });

  test("--team <id> --resume <sid> -> tui carrying both", () => {
    expect(parseFlags(["--team", "alpha", "--resume", "sess-1"])).toEqual({
      kind: "tui",
      team: "alpha",
      resume: "sess-1",
      inMemory: false,
      debug: false,
      noInstall: false,
    });
  });

  test("--team <id> <instruction> stays print", () => {
    expect(parseFlags(["--team", "alpha", "do it"])).toMatchObject({ kind: "print", instruction: "do it", team: "alpha" });
  });

  test("--resume <id> with -p stays print carrying the session id", () => {
    expect(parseFlags(["--resume", "sess-1", "-p", "hi"])).toMatchObject({ kind: "print", instruction: "hi", resume: "sess-1" });
  });

  test("--team without argument still errors", () => {
    expect(parseFlags(["--team"])).toEqual({ kind: "error", message: "missing argument for --team" });
  });

  test("--resume without argument still errors", () => {
    expect(parseFlags(["--resume"])).toEqual({ kind: "error", message: "missing argument for --resume" });
  });

  test("--team with --json but no instruction errors (print-only flag without instruction)", () => {
    expect(parseFlags(["--team", "alpha", "--json"])).toEqual({
      kind: "error",
      message: "missing instruction for -p/--print",
    });
  });

  test("--api-key with --resume but no instruction errors (apiKey has no tui form)", () => {
    expect(parseFlags(["--api-key", "k", "--resume", "sess-1"])).toEqual({
      kind: "error",
      message: "missing instruction for -p/--print",
    });
  });

  test("duplicate --resume without instruction reports the duplicate", () => {
    expect(parseFlags(["--resume", "a", "--resume", "b"])).toEqual({
      kind: "error",
      message: "duplicate flag: --resume",
    });
  });
});

describe("parseFlags — --debug", () => {
  test("--debug alone -> tui with debug true", () => {
    expect(parseFlags(["--debug"])).toEqual({ kind: "tui", inMemory: false, debug: true, noInstall: false });
  });

  test("--debug --in-memory -> tui with both flags", () => {
    expect(parseFlags(["--debug", "--in-memory"])).toEqual({ kind: "tui", inMemory: true, debug: true, noInstall: false });
  });

  test("--debug -p <instruction> -> print with debug true", () => {
    expect(parseFlags(["--debug", "-p", "go"])).toEqual({
      kind: "print",
      instruction: "go",
      team: undefined,
      timeout: 300,
      json: false,
      apiKey: undefined,
      resume: undefined,
      inMemory: false,
      debug: true,
    });
  });

  test("-p <instruction> --debug -> print with debug true", () => {
    expect(parseFlags(["-p", "go", "--debug"])).toMatchObject({ kind: "print", instruction: "go", debug: true });
  });

  test("duplicate --debug is rejected", () => {
    expect(parseFlags(["--debug", "--debug", "-p", "go"])).toEqual({
      kind: "error",
      message: "duplicate flag: --debug",
    });
  });
});

describe("parseFlags - --no-install", () => {
  test("--no-install alone -> tui with noInstall true", () => {
    expect(parseFlags(["--no-install"])).toEqual({ kind: "tui", inMemory: false, debug: false, noInstall: true });
  });

  test("--no-install --in-memory -> tui with both", () => {
    expect(parseFlags(["--no-install", "--in-memory"])).toEqual({ kind: "tui", inMemory: true, debug: false, noInstall: true });
  });

  test("--in-memory --no-install -> tui with both (flag order after --in-memory)", () => {
    expect(parseFlags(["--in-memory", "--no-install"])).toEqual({ kind: "tui", inMemory: true, debug: false, noInstall: true });
  });

  test("--in-memory --no-install -p <instruction> -> print carrying noInstall onward", () => {
    expect(parseFlags(["--in-memory", "--no-install", "-p", "go"])).toMatchObject({ kind: "print", instruction: "go" });
  });

  test("--in-memory --no-install <team> -> tui with team and noInstall", () => {
    expect(parseFlags(["--in-memory", "--no-install", "alpha"])).toEqual({
      kind: "tui",
      team: "alpha",
      inMemory: true,
      debug: false,
      noInstall: true,
    });
  });

  test("--in-memory --debug -> tui with both (debug after --in-memory, no phantom arg)", () => {
    expect(parseFlags(["--in-memory", "--debug"])).toEqual({ kind: "tui", inMemory: true, debug: true, noInstall: false });
  });

  test("--in-memory --no-install --no-install -> duplicate rejected", () => {
    expect(parseFlags(["--in-memory", "--no-install", "--no-install"])).toEqual({
      kind: "error",
      message: "duplicate flag: --no-install",
    });
  });

  test("--no-install --debug -> tui with both leading flags", () => {
    expect(parseFlags(["--no-install", "--debug"])).toEqual({ kind: "tui", inMemory: false, debug: true, noInstall: true });
  });

  test("--no-install -p <instruction> -> print (no-install is a no-op in print mode)", () => {
    expect(parseFlags(["--no-install", "-p", "go"])).toMatchObject({ kind: "print", instruction: "go" });
  });

  test("--team <id> --no-install -> tui fallback carrying noInstall", () => {
    expect(parseFlags(["--team", "alpha", "--no-install"])).toEqual({
      kind: "tui",
      team: "alpha",
      inMemory: false,
      debug: false,
      noInstall: true,
    });
  });

  test("duplicate --no-install is rejected", () => {
    expect(parseFlags(["--no-install", "--no-install", "-p", "go"])).toEqual({
      kind: "error",
      message: "duplicate flag: --no-install",
    });
  });
});

describe("parseFlags — duplicate detection across parser zones", () => {
  test("--debug leading and later in run is a duplicate", () => {
    expect(parseFlags(["--debug", "-p", "go", "--debug"])).toEqual({
      kind: "error",
      message: "duplicate flag: --debug",
    });
  });

  test("--debug around --in-memory is a duplicate", () => {
    expect(parseFlags(["--debug", "--in-memory", "--debug"])).toEqual({
      kind: "error",
      message: "duplicate flag: --debug",
    });
  });

  test("--no-install around --in-memory is a duplicate", () => {
    expect(parseFlags(["--no-install", "--in-memory", "--no-install"])).toEqual({
      kind: "error",
      message: "duplicate flag: --no-install",
    });
  });

  test("--in-memory in two parser zones is a duplicate", () => {
    expect(parseFlags(["--in-memory", "-p", "go", "--in-memory"])).toEqual({
      kind: "error",
      message: "duplicate flag: --in-memory",
    });
  });

  test("duplicate --api-key is rejected", () => {
    expect(parseFlags(["--api-key", "k1", "-p", "go", "--api-key", "k2"])).toEqual({
      kind: "error",
      message: "duplicate flag: --api-key",
    });
  });

  test("duplicate --provider in login is rejected", () => {
    expect(parseFlags(["login", "--provider", "a", "--provider", "b"])).toEqual({
      kind: "error",
      message: "duplicate flag: --provider",
    });
  });

  test("duplicate --project in team add is rejected", () => {
    expect(parseFlags(["team", "add", "src", "--project", "--project"])).toEqual({
      kind: "error",
      message: "duplicate flag: --project",
    });
  });

  test("duplicate --force in team add is rejected", () => {
    expect(parseFlags(["team", "add", "src", "--force", "--force"])).toEqual({
      kind: "error",
      message: "duplicate flag: --force",
    });
  });

  test("duplicate --project in team remove is rejected", () => {
    expect(parseFlags(["team", "remove", "dev", "--project", "--project"])).toEqual({
      kind: "error",
      message: "duplicate flag: --project",
    });
  });
});

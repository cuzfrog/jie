import { parseFlags } from "./cli-flags";

describe("parseFlags — help / version", () => {
  test("no args -> tui (TUI not implemented in v1)", () => {
    expect(parseFlags([])).toEqual({ kind: "tui", inMemory: false });
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
  test("team dev", () => {
    expect(parseFlags(["team", "dev"])).toEqual({ kind: "team", teamId: "dev" });
  });

  test("team (no arg)", () => {
    expect(parseFlags(["team"])).toEqual({ kind: "team", teamId: undefined });
  });

  test("team --unset -> unknown flag error", () => {
    expect(parseFlags(["team", "--unset"])).toEqual({ kind: "error", message: "unknown flag: --unset" });
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
    expect(parseFlags(["--in-memory"])).toEqual({ kind: "tui", inMemory: true });
  });

  test("--in-memory followed by positional -> tui with team + inMemory true", () => {
    expect(parseFlags(["--in-memory", "alpha"])).toEqual({
      kind: "tui",
      team: "alpha",
      inMemory: true,
    });
  });

  test("--in-memory --team <name> follows parsePrint (needs instruction)", () => {
    expect(parseFlags(["--in-memory", "--team", "alpha"])).toEqual({
      kind: "error",
      message: "missing instruction for -p/--print",
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
});

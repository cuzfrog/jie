import type { JiePlatform } from "../jie-platform";

export type InterceptOutcome =
  | { readonly kind: "reply"; readonly text: string }
  | { readonly kind: "error"; readonly text: string }
  | { readonly kind: "load"; readonly teamId: string }
  | null;

export interface TuiInterceptDeps {
  readonly platform: JiePlatform;
  readonly onLoadTeamError: (teamId: string, message: string) => void;
}

export type TuiInterceptFn = (args: ReadonlyArray<string>, deps: TuiInterceptDeps) => Promise<InterceptOutcome>;

interface ParsedDeps {
  readonly platform: JiePlatform;
  readonly onLoadTeamError: TuiInterceptDeps["onLoadTeamError"];
}

function parseModelArg(arg: string): { kind: "ok"; provider: string; modelId: string } | { kind: "error"; text: string } {
  const slash = arg.indexOf("/");
  if (slash === -1) return { kind: "error", text: `/model: invalid '${arg}' (expected <provider>/<modelId>)` };
  const provider = arg.slice(0, slash);
  const modelId = arg.slice(slash + 1);
  if (provider === "" || modelId === "") return { kind: "error", text: `/model: invalid '${arg}' (expected <provider>/<modelId>)` };
  return { kind: "ok", provider, modelId };
}

function formatTeamListReply(defaultTeam: string | null, installed: ReadonlyArray<string>): string {
  return `defaultTeam: ${defaultTeam ?? "unset"} | installed: ${installed.join(", ")}`;
}

async function interceptLogin(args: ReadonlyArray<string>, deps: ParsedDeps): Promise<InterceptOutcome> {
  if (args.length !== 2) return { kind: "error", text: "/login <provider> <apiKey>" };
  const [provider, apiKey] = args;
  if (provider === undefined || apiKey === undefined) return { kind: "error", text: "/login <provider> <apiKey>" };
  const result = await deps.platform.command("login", { provider, apiKey });
  if (result.kind === "error") return { kind: "error", text: `/login failed: ${result.message}` };
  return { kind: "reply", text: `logged in to ${provider}` };
}

async function interceptLogout(args: ReadonlyArray<string>, deps: ParsedDeps): Promise<InterceptOutcome> {
  const provider = args[0];
  const result = await deps.platform.command("logout", { provider });
  if (result.kind === "error") return { kind: "error", text: `/logout failed: ${result.message}` };
  return { kind: "reply", text: provider === undefined ? "logged out of all providers" : `logged out of ${provider}` };
}

async function interceptModel(args: ReadonlyArray<string>, deps: ParsedDeps): Promise<InterceptOutcome> {
  if (args.length !== 1 || args[0] === undefined) return { kind: "error", text: "/model <provider>/<modelId>" };
  const parsed = parseModelArg(args[0]);
  if (parsed.kind === "error") return parsed;
  const result = await deps.platform.command("model", { provider: parsed.provider, modelId: parsed.modelId });
  if (result.kind === "error") return { kind: "error", text: `/model failed: ${result.message}` };
  return { kind: "reply", text: `default model set to ${parsed.provider}/${parsed.modelId}` };
}

async function interceptTeam(args: ReadonlyArray<string>, deps: ParsedDeps): Promise<InterceptOutcome> {
  if (args[0] === "--unset") {
    const result = await deps.platform.command("team", { teamId: undefined, unset: true });
    if (result.kind === "error") return { kind: "error", text: `/team --unset failed: ${result.message}` };
    return { kind: "reply", text: "default team unset; takes effect on next `jie` invocation" };
  }
  if (args.length === 0) {
    const installed = deps.platform.listInstalledTeams();
    const defaultTeam = deps.platform.getDefaultTeam();
    return { kind: "reply", text: formatTeamListReply(defaultTeam, installed) };
  }
  const argument = args[0]!;
  void deps.platform.command("team", { teamId: argument, unset: false }).then(
    () => undefined,
    (error: unknown) => {
      const code = error instanceof Error && "code" in error && typeof (error as { code: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
      const message = code === "TEAM_NOT_FOUND" ? `team '${argument}' not found` : `loadTeam(${argument}) failed`;
      deps.onLoadTeamError(argument, message);
    },
  );
  return { kind: "reply", text: `switching to team '${argument}'…` };
}

export const intercepts: ReadonlyMap<string, TuiInterceptFn> = new Map([
  ["login", interceptLogin],
  ["logout", interceptLogout],
  ["model", interceptModel],
  ["team", interceptTeam],
]);


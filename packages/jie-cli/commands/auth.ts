import { type JiePlatform } from "@cuzfrog/jie-platform";
import type { ParsedArgsMap } from "../cli-flags";

export async function runLogin(
  parsed: ParsedArgsMap["login"],
  platform: JiePlatform,
): Promise<number> {
  if (parsed.provider === undefined || parsed.apiKey === undefined) {
    console.error("interactive login not implemented in v1; use --provider and --api-key");
    return 1;
  }
  await platform.execute({ name: "login", provider: parsed.provider, apiKey: parsed.apiKey });
  console.log(`logged in to ${parsed.provider}`);
  return 0;
}

export async function runLogout(
  parsed: ParsedArgsMap["logout"],
  platform: JiePlatform,
): Promise<number> {
  await platform.execute({ name: "logout", provider: parsed.provider });
  console.log(parsed.provider === undefined ? "logged out of all providers" : `logged out of ${parsed.provider}`);
  return 0;
}

export async function runApiKey(
  parsed: ParsedArgsMap["apiKey"],
  platform: JiePlatform,
): Promise<number> {
  const current = await platform.execute<"getDefaultModel">({ name: "getDefaultModel" });
  if (current === null) {
    console.error(
      "no provider resolved; run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>' to set the key for a specific provider",
    );
    return 1;
  }
  await platform.execute({ name: "login", provider: current.provider, apiKey: parsed.apiKey });
  console.log(`logged in to ${current.provider}`);
  return 0;
}

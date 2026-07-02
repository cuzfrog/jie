
import type { AuthStore, SettingsStore } from "@cuzfrog/jie-platform/config";
import type { ParsedArgsMap } from "../cli-flags";

export async function runLogin(
  parsed: ParsedArgsMap["login"],
  auth: AuthStore,
): Promise<number> {
  if (parsed.provider === undefined || parsed.apiKey === undefined) {
    console.error(
      "interactive login not implemented in v1; use --provider and --api-key",
    );
    return 1;
  }
  auth.saveAuthConfig(auth.setProvider(auth.load(), parsed.provider, parsed.apiKey));
  console.log(`logged in to ${parsed.provider}`);
  return 0;
}

export async function runLogout(
  parsed: ParsedArgsMap["logout"],
  auth: AuthStore,
): Promise<number> {
  if (parsed.provider !== undefined) {
    auth.saveAuthConfig(auth.removeProvider(auth.load(), parsed.provider));
    console.log(`logged out of ${parsed.provider}`);
  } else {
    auth.saveAuthConfig(auth.clear());
    console.log("logged out of all providers");
  }
  return 0;
}

export async function runApiKey(
  parsed: ParsedArgsMap["apiKey"],
  settings: SettingsStore,
  auth: AuthStore,
): Promise<number> {
  const provider = settings.load().defaultProvider;
  if (provider === undefined) {
    console.error(
      "no provider resolved; run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>' to set the key for a specific provider",
    );
    return 1;
  }
  auth.saveAuthConfig(auth.setProvider(auth.load(), provider, parsed.apiKey));
  console.log(`logged in to ${provider}`);
  return 0;
}

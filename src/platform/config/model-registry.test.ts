import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntimeModelRegistry } from "./model-registry-runtime";
import { AuthStoreImpl } from "./auth-store";

const ANTHROPIC_ENV_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_OAUTH_TOKEN"] as const;

describe("ModelRuntimeModelRegistry", () => {
  let cwd: string;
  let homeDir: string;
  let homeJieDir: string;
  let projectJieDir: string | null;
  let authStore: AuthStoreImpl;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "jie-reg-cwd-"));
    homeDir = mkdtempSync(join(tmpdir(), "jie-reg-home-"));
    homeJieDir = join(homeDir, ".jie");
    projectJieDir = null;
    authStore = new AuthStoreImpl(homeJieDir);
    savedEnv = {};
    for (const name of ANTHROPIC_ENV_VARS) {
      savedEnv[name] = process.env[name];
      delete process.env[name];
    }
    process.env.PI_OFFLINE = "1";
  });

  afterEach(() => {
    delete process.env.PI_OFFLINE;
    for (const name of ANTHROPIC_ENV_VARS) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  async function createRegistry(): Promise<ModelRuntimeModelRegistry> {
    return await ModelRuntimeModelRegistry.create(homeJieDir, projectJieDir, authStore);
  }

  function writeHomeModelsConfig(config: unknown): void {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(join(homeJieDir, "models.json"), JSON.stringify(config));
  }

  test("providers() includes built-in providers", async () => {
    const registry = await createRegistry();
    const providers = registry.providers();
    expect(providers.length).toBeGreaterThan(0);
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
  });

  test("built-in without credentials: getAuth returns undefined", async () => {
    const registry = await createRegistry();
    await expect(registry.getAuth("anthropic")).resolves.toBeUndefined();
  });

  test("built-in + auth.json api_key: getAuth resolves the stored key", async () => {
    authStore.setProvider("anthropic", "sk-from-auth");
    const registry = await createRegistry();
    const auth = await registry.getAuth("anthropic");
    expect(auth?.auth.apiKey).toBe("sk-from-auth");
  });

  test("auth.json takes precedence over models.json apiKey for a built-in provider", async () => {
    writeHomeModelsConfig({
      providers: {
        anthropic: {
          baseUrl: "https://my-proxy.example.com",
          apiKey: "sk-from-models",
        },
      },
    });
    authStore.setProvider("anthropic", "sk-from-auth");
    const registry = await createRegistry();
    const auth = await registry.getAuth("anthropic");
    expect(auth?.auth.apiKey).toBe("sk-from-auth");
  });

  test("built-in override with a models.json apiKey: getAuth resolves the configured key", async () => {
    writeHomeModelsConfig({
      providers: {
        anthropic: {
          baseUrl: "https://my-proxy.example.com",
          apiKey: "sk-from-models",
        },
      },
    });
    const registry = await createRegistry();
    const auth = await registry.getAuth("anthropic");
    expect(auth?.auth.apiKey).toBe("sk-from-models");
  });

  test("custom provider in home models.json: resolve() returns the registered Model", async () => {
    writeHomeModelsConfig({
      providers: {
        "lm-studio": {
          baseUrl: "http://localhost:1234/v1",
          api: "openai-completions",
          apiKey: "x",
          models: [{ id: "qwen3.5-2b", contextWindow: 4096, maxTokens: 1024 }],
        },
      },
    });
    const registry = await createRegistry();
    const model = registry.resolve("lm-studio", "qwen3.5-2b");
    expect(model).toBeDefined();
    expect(model?.id).toBe("qwen3.5-2b");
    expect(model?.provider).toBe("lm-studio");
    expect(model?.baseUrl).toBe("http://localhost:1234/v1");
  });

  test("custom provider with a stored credential: auth.json wins over models.json", async () => {
    writeHomeModelsConfig({
      providers: {
        "lm-studio": {
          baseUrl: "http://localhost:1234/v1",
          api: "openai-completions",
          apiKey: "my-key",
        },
      },
    });
    authStore.setProvider("lm-studio", "stored-key");
    const registry = await createRegistry();
    const auth = await registry.getAuth("lm-studio");
    expect(auth?.auth.apiKey).toBe("stored-key");
  });

  test("custom provider with empty apiKey in models.json: getAuth returns undefined", async () => {
    writeHomeModelsConfig({
      providers: {
        "lm-studio": {
          baseUrl: "http://localhost:1234/v1",
          api: "openai-completions",
          apiKey: "",
        },
      },
    });
    const registry = await createRegistry();
    await expect(registry.getAuth("lm-studio")).resolves.toBeUndefined();
  });

  test("unknown provider: resolve() and getAuth return undefined", async () => {
    const registry = await createRegistry();
    expect(registry.resolve("not-a-real-provider", "any-model")).toBeUndefined();
    await expect(registry.getAuth("not-a-real-provider")).resolves.toBeUndefined();
  });

  test("listProviders: built-in providers without credentials report configured false and no env keys", async () => {
    const registry = await createRegistry();
    const anthropic = registry.listProviders().find((provider) => provider.id === "anthropic");
    expect(anthropic).toBeDefined();
    expect(anthropic!.configured).toBe(false);
    expect(anthropic!.envKeys).toEqual([]);
  });

  test("listProviders: an ambient env api key marks a built-in provider configured and reports its key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    try {
      const registry = await createRegistry();
      const anthropic = registry.listProviders().find((provider) => provider.id === "anthropic");
      expect(anthropic!.configured).toBe(true);
      expect(anthropic!.envKeys).toContain("ANTHROPIC_API_KEY");
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  test("project models.json overrides a built-in provider baseUrl", async () => {
    const projJie = join(cwd, ".jie");
    mkdirSync(projJie, { recursive: true });
    writeFileSync(
      join(projJie, "models.json"),
      JSON.stringify({
        providers: {
          anthropic: {
            baseUrl: "https://my-proxy.example.com",
          },
        },
      }),
    );
    projectJieDir = projJie;
    const registry = await createRegistry();
    const models = registry.listModels("anthropic");
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]?.baseUrl).toBe("https://my-proxy.example.com");
    expect(registry.providers()).toContain("anthropic");
  });

  test("reload picks up a provider added to home models.json after construction", async () => {
    writeHomeModelsConfig({ providers: {} });
    const registry = await createRegistry();
    expect(registry.providers()).not.toContain("lm-studio");
    writeHomeModelsConfig({
      providers: {
        "lm-studio": {
          baseUrl: "http://localhost:1234/v1",
          api: "openai-completions",
          apiKey: "x",
          models: [{ id: "qwen3.5-2b", contextWindow: 4096, maxTokens: 1024 }],
        },
      },
    });
    await registry.reload();
    expect(registry.providers()).toContain("lm-studio");
    expect(registry.resolve("lm-studio", "qwen3.5-2b")?.baseUrl).toBe("http://localhost:1234/v1");
    const auth = await registry.getAuth("lm-studio");
    expect(auth?.auth.apiKey).toBe("x");
  });

  test("reload drops a provider removed from home models.json", async () => {
    writeHomeModelsConfig({
      providers: {
        "lm-studio": { baseUrl: "http://x", api: "openai-completions", models: [{ id: "m1" }] },
      },
    });
    const registry = await createRegistry();
    expect(registry.resolve("lm-studio", "m1")).toBeDefined();
    writeHomeModelsConfig({ providers: {} });
    await registry.reload();
    expect(registry.providers()).not.toContain("lm-studio");
    expect(registry.resolve("lm-studio", "m1")).toBeUndefined();
  });

  test("reload re-registers project providers after project config changes", async () => {
    const projJie = join(cwd, ".jie");
    mkdirSync(projJie, { recursive: true });
    writeFileSync(
      join(projJie, "models.json"),
      JSON.stringify({
        providers: {
          anthropic: { baseUrl: "https://first.example.com" },
        },
      }),
    );
    projectJieDir = projJie;
    const registry = await createRegistry();
    expect(registry.listModels("anthropic")[0]?.baseUrl).toBe("https://first.example.com");
    writeFileSync(
      join(projJie, "models.json"),
      JSON.stringify({
        providers: {
          anthropic: { baseUrl: "https://second.example.com" },
        },
      }),
    );
    await registry.reload();
    expect(registry.listModels("anthropic")[0]?.baseUrl).toBe("https://second.example.com");
  });

  test("refresh offline: reports no errors without network access", async () => {
    const registry = await createRegistry();
    await expect(registry.refresh(true)).resolves.toEqual({ errors: [] });
  });
});

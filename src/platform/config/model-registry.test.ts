import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiModelRegistry } from "./model-registry";
import { AuthStoreImpl } from "./auth-store";

const ANTHROPIC_ENV_VARS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_OAUTH_TOKEN"] as const;

describe("PiModelRegistry", () => {
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
  });

  afterEach(() => {
    for (const name of ANTHROPIC_ENV_VARS) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("empty registry: providers() returns only built-ins", () => {
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    const providers = reg.providers();
    expect(providers.length).toBeGreaterThan(0);
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
  });

  test("built-in without credentials: getAuth returns undefined", async () => {
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    await expect(reg.getAuth("anthropic")).resolves.toBeUndefined();
  });

  test("built-in + auth.json api_key: getAuth resolves the stored key", async () => {
    authStore.setProvider("anthropic", "sk-from-auth");
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    const auth = await reg.getAuth("anthropic");
    expect(auth?.auth.apiKey).toBe("sk-from-auth");
  });

  test("built-in + auth.json oauth: getAuth resolves the OAuth token", async () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "auth.json"),
      JSON.stringify({
        anthropic: { type: "oauth", access: "sk-ant-oat-test", refresh: "refresh-token", expires: Date.now() + 3600_000 },
      }),
    );
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    const auth = await reg.getAuth("anthropic");
    expect(auth?.auth.apiKey).toBe("sk-ant-oat-test");
  });

  test("auth.json takes precedence over models.json for a built-in provider override", async () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          anthropic: {
            baseUrl: "https://my-proxy.example.com",
            apiKey: "sk-from-models",
          },
        },
      }),
    );
    authStore.setProvider("anthropic", "sk-from-auth");
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    const auth = await reg.getAuth("anthropic");
    expect(auth?.auth.apiKey).toBe("sk-from-auth");
  });

  test("built-in override with a models.json apiKey: getAuth resolves the configured key", async () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          anthropic: {
            baseUrl: "https://my-proxy.example.com",
            apiKey: "sk-from-models",
          },
        },
      }),
    );
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    const auth = await reg.getAuth("anthropic");
    expect(auth?.auth.apiKey).toBe("sk-from-models");
  });

  test("custom provider: resolve() returns the registered Model", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": {
            baseUrl: "http://localhost:1234/v1",
            api: "openai-completions",
            apiKey: "x",
            models: [{ id: "qwen3.5-2b", contextWindow: 4096, maxTokens: 1024 }],
          },
        },
      }),
    );
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    const model = reg.resolve("lm-studio", "qwen3.5-2b");
    expect(model).toBeDefined();
    expect(model?.id).toBe("qwen3.5-2b");
    expect(model?.provider).toBe("lm-studio");
    expect(model?.baseUrl).toBe("http://localhost:1234/v1");
  });

  test("custom provider with no auth.json entry: getAuth resolves the models.json key", async () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": {
            baseUrl: "http://localhost:1234/v1",
            api: "openai-completions",
            apiKey: "my-key",
            models: [],
          },
        },
      }),
    );
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    const auth = await reg.getAuth("lm-studio");
    expect(auth?.auth.apiKey).toBe("my-key");
  });

  test("custom provider with a stored credential: auth.json wins over models.json", async () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": {
            baseUrl: "http://localhost:1234/v1",
            api: "openai-completions",
            apiKey: "my-key",
            models: [],
          },
        },
      }),
    );
    authStore.setProvider("lm-studio", "stored-key");
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    const auth = await reg.getAuth("lm-studio");
    expect(auth?.auth.apiKey).toBe("stored-key");
  });

  test("custom provider with empty apiKey in models.json: getAuth returns undefined", async () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": {
            baseUrl: "http://localhost:1234/v1",
            api: "openai-completions",
            apiKey: "",
            models: [],
          },
        },
      }),
    );
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    await expect(reg.getAuth("lm-studio")).resolves.toBeUndefined();
  });

  test("built-in provider: resolve() returns pi-ai's model", () => {
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    const providers = reg.providers();
    const anthropicProvider = providers.find((p) => p === "anthropic");
    expect(anthropicProvider).toBeDefined();
    const models = reg.listModels("anthropic");
    expect(models.length).toBeGreaterThan(0);
    const model = reg.resolve("anthropic", models[0]!.id);
    expect(model).toBeDefined();
    expect(model?.provider).toBe("anthropic");
  });

  test("built-in provider with override: baseUrl is replaced on resolved model", () => {
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
    const reg = new PiModelRegistry(homeJieDir, projJie, authStore);
    const models = reg.listModels("anthropic");
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]?.baseUrl).toBe("https://my-proxy.example.com");
  });

  test("unknown provider: resolve() returns undefined", () => {
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    expect(reg.resolve("not-a-real-provider", "any-model")).toBeUndefined();
  });

  test("unknown provider: getAuth returns undefined", async () => {
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    await expect(reg.getAuth("not-a-real-provider")).resolves.toBeUndefined();
  });

  test("providers() lists custom before built-in", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": { baseUrl: "http://x", api: "openai-completions", models: [] },
        },
      }),
    );
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    const providers = reg.providers();
    expect(providers[0]).toBe("lm-studio");
  });

  test("listModels: custom provider returns its own models", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          custom: {
            baseUrl: "http://x",
            api: "openai-completions",
            models: [{ id: "m1" }, { id: "m2" }],
          },
        },
      }),
    );
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    const models = reg.listModels("custom");
    expect(models).toHaveLength(2);
    expect(models.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
  });

  test("listProviders: built-in providers report configured false", () => {
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    const anthropic = reg.listProviders().find((provider) => provider.id === "anthropic");
    expect(anthropic).toBeDefined();
    expect(anthropic!.configured).toBe(false);
  });

  test("listProviders: a models.json provider reports configured true and lists first", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": { baseUrl: "http://x", api: "openai-completions", models: [] },
        },
      }),
    );
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    const providers = reg.listProviders();
    expect(providers[0]).toEqual({ id: "lm-studio", configured: true, envKeys: [] });
  });

  test("reload picks up a provider added to models.json after construction", async () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(join(homeJieDir, "models.json"), JSON.stringify({ providers: {} }));
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    expect(reg.providers()).not.toContain("lm-studio");
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": {
            baseUrl: "http://localhost:1234/v1",
            api: "openai-completions",
            apiKey: "x",
            models: [{ id: "qwen3.5-2b", contextWindow: 4096, maxTokens: 1024 }],
          },
        },
      }),
    );
    reg.reload();
    expect(reg.providers()).toContain("lm-studio");
    expect(reg.resolve("lm-studio", "qwen3.5-2b")?.baseUrl).toBe("http://localhost:1234/v1");
    const auth = await reg.getAuth("lm-studio");
    expect(auth?.auth.apiKey).toBe("x");
  });

  test("reload drops a provider removed from models.json", async () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": { baseUrl: "http://x", api: "openai-completions", models: [{ id: "m1" }] },
        },
      }),
    );
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    expect(reg.resolve("lm-studio", "m1")).toBeDefined();
    writeFileSync(join(homeJieDir, "models.json"), JSON.stringify({ providers: {} }));
    reg.reload();
    expect(reg.providers()).not.toContain("lm-studio");
    expect(reg.resolve("lm-studio", "m1")).toBeUndefined();
    await expect(reg.getAuth("lm-studio")).resolves.toBeUndefined();
  });

  test("reload without a models.json falls back to built-ins only", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": { baseUrl: "http://x", api: "openai-completions", models: [] },
        },
      }),
    );
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    rmSync(join(homeJieDir, "models.json"));
    reg.reload();
    expect(reg.providers()).not.toContain("lm-studio");
    expect(reg.providers()).toContain("anthropic");
  });

  test("listProviders: reports the env var names set for a built-in provider", () => {
    const original = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-test";
    try {
      const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
      const anthropic = reg.listProviders().find((provider) => provider.id === "anthropic");
      expect(anthropic!.envKeys).toContain("ANTHROPIC_API_KEY");
    } finally {
      if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = original;
    }
  });
});

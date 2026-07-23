import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiModelRegistry } from "./model-registry";
import type { AuthStore } from "./auth-store";
import { JiePlatformError } from "../jie-platform-errors";

const authStore = vi.mocked<AuthStore>({
  load: vi.fn(),
  saveAuthConfig: vi.fn(),
  setProvider: vi.fn(),
  removeProvider: vi.fn(),
  clear: vi.fn(),
});

describe("PiModelRegistry", () => {
  let cwd: string;
  let homeDir: string;
  let homeJieDir: string;
  let projectJieDir: string | null;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "jie-reg-cwd-"));
    homeDir = mkdtempSync(join(tmpdir(), "jie-reg-home-"));
    homeJieDir = join(homeDir, ".jie");
    projectJieDir = null;
  });

  afterEach(() => {
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

  test("empty registry: getApiKey returns undefined for built-in when auth.json has no entry", () => {
    authStore.load.mockReturnValueOnce({});
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    expect(reg.getApiKey("anthropic")).toBeUndefined();
  });

  test("built-in + auth.json api_key: getApiKey returns the auth.json key", () => {
    authStore.load.mockReturnValueOnce({ anthropic: { type: "api_key", key: "sk-from-auth" } });
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    expect(reg.getApiKey("anthropic")).toBe("sk-from-auth");
  });

  test("built-in + auth.json oauth: getApiKey throws JiePlatformError code 'oauth_not_supported'", () => {
    authStore.load.mockReturnValueOnce({
      anthropic: {
        type: "oauth",
        access: "access-token",
        refresh: "refresh-token",
        expires: 0,
      },
    });
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    let caught: unknown;
    try {
      reg.getApiKey("anthropic");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JiePlatformError);
    expect(caught).toMatchObject({
      code: "OAUTH_NOT_SUPPORTED",
      message: expect.stringContaining("anthropic"),
    });
  });

  test("auth.json takes precedence over models.json for a built-in provider override", () => {
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
    authStore.load.mockReturnValueOnce({ anthropic: { type: "api_key", key: "sk-from-auth" } });
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    expect(reg.getApiKey("anthropic")).toBe("sk-from-auth");
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

  test("custom provider with no auth.json entry: getApiKey returns the models.json key", () => {
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
    authStore.load.mockReturnValueOnce({});
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    expect(reg.getApiKey("lm-studio")).toBe("my-key");
  });

  test("custom provider with empty apiKey in models.json: getApiKey returns undefined", () => {
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
    authStore.load.mockReturnValueOnce({});
    const reg = new PiModelRegistry(homeJieDir, projectJieDir, authStore);
    expect(reg.getApiKey("lm-studio")).toBeUndefined();
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
});

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRegistry } from "./model-registry.ts";
import { loadModelsConfig } from "./load-models.ts";

describe("ModelRegistry", () => {
  let cwd: string;
  let homeDir: string;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "jie-reg-cwd-"));
    homeDir = mkdtempSync(join(tmpdir(), "jie-reg-home-"));
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("empty registry: providers() returns only built-ins", () => {
    const reg = ModelRegistry.load(cwd, { homeDir });
    const providers = reg.providers();
    expect(providers.length).toBeGreaterThan(0);
    expect(providers).toContain("anthropic");
    expect(providers).toContain("openai");
  });

  test("empty registry: getApiKey returns undefined for built-in (auth.json flow)", () => {
    const reg = ModelRegistry.load(cwd, { homeDir });
    expect(reg.getApiKey("anthropic")).toBeUndefined();
  });

  test("custom provider: resolve() returns the registered Model", () => {
    mkdirSync(join(homeDir, ".jie"), { recursive: true });
    writeFileSync(
      join(homeDir, ".jie", "models.json"),
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
    const reg = ModelRegistry.load(cwd, { homeDir });
    const model = reg.resolve("lm-studio", "qwen3.5-2b");
    expect(model).toBeDefined();
    expect(model?.id).toBe("qwen3.5-2b");
    expect(model?.provider).toBe("lm-studio");
    expect(model?.baseUrl).toBe("http://localhost:1234/v1");
  });

  test("custom provider: getApiKey returns the resolved key", () => {
    mkdirSync(join(homeDir, ".jie"), { recursive: true });
    writeFileSync(
      join(homeDir, ".jie", "models.json"),
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
    const reg = ModelRegistry.load(cwd, { homeDir });
    expect(reg.getApiKey("lm-studio")).toBe("my-key");
  });

  test("custom provider: getApiKey returns undefined for empty apiKey", () => {
    mkdirSync(join(homeDir, ".jie"), { recursive: true });
    writeFileSync(
      join(homeDir, ".jie", "models.json"),
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
    const reg = ModelRegistry.load(cwd, { homeDir });
    expect(reg.getApiKey("lm-studio")).toBeUndefined();
  });

  test("built-in provider: resolve() returns pi-ai's model", () => {
    const reg = ModelRegistry.load(cwd, { homeDir });
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
    mkdirSync(join(cwd, ".jie"), { recursive: true });
    writeFileSync(
      join(cwd, ".jie", "models.json"),
      JSON.stringify({
        providers: {
          anthropic: {
            baseUrl: "https://my-proxy.example.com",
          },
        },
      }),
    );
    const reg = ModelRegistry.load(cwd, { homeDir });
    const models = reg.listModels("anthropic");
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]?.baseUrl).toBe("https://my-proxy.example.com");
  });

  test("unknown provider: resolve() returns undefined", () => {
    const reg = ModelRegistry.load(cwd, { homeDir });
    expect(reg.resolve("not-a-real-provider", "any-model")).toBeUndefined();
  });

  test("providers() lists custom before built-in", () => {
    mkdirSync(join(homeDir, ".jie"), { recursive: true });
    writeFileSync(
      join(homeDir, ".jie", "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": { baseUrl: "http://x", api: "openai-completions", models: [] },
        },
      }),
    );
    const reg = ModelRegistry.load(cwd, { homeDir });
    const providers = reg.providers();
    expect(providers[0]).toBe("lm-studio");
  });

  test("listModels: custom provider returns its own models", () => {
    mkdirSync(join(homeDir, ".jie"), { recursive: true });
    writeFileSync(
      join(homeDir, ".jie", "models.json"),
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
    const reg = ModelRegistry.load(cwd, { homeDir });
    const models = reg.listModels("custom");
    expect(models).toHaveLength(2);
    expect(models.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
  });

  test("registry constructed from a pre-built config", () => {
    mkdirSync(join(homeDir, ".jie"), { recursive: true });
    writeFileSync(
      join(homeDir, ".jie", "models.json"),
      JSON.stringify({
        providers: {
          direct: {
            baseUrl: "http://y",
            api: "openai-completions",
            models: [{ id: "z" }],
          },
        },
      }),
    );
    const custom = loadModelsConfig(cwd, { homeDir });
    const reg = new ModelRegistry(custom);
    expect(reg.resolve("direct", "z")).toBeDefined();
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadModelsConfig, _resolveValue } from "./load-models";

describe("loadModelsConfig", () => {
  let cwd: string;
  let homeDir: string;
  let homeJieDir: string;
  let projectJieDir: string | null;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "jie-models-cwd-"));
    homeDir = mkdtempSync(join(tmpdir(), "jie-models-home-"));
    homeJieDir = join(homeDir, ".jie");
    projectJieDir = null;
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("returns empty config when neither file exists", () => {
    const result = loadModelsConfig(homeJieDir, projectJieDir);
    expect(result.providers.size).toBe(0);
    expect(result.models).toEqual([]);
  });

  test("loads a well-formed global models.json", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": {
            baseUrl: "http://localhost:1234/v1",
            api: "openai-completions",
            apiKey: "not-needed",
            models: [{ id: "qwen3.5-2b" }],
          },
        },
      }),
    );
    const result = loadModelsConfig(homeJieDir, projectJieDir);
    expect(result.providers.size).toBe(1);
    const provider = result.providers.get("lm-studio");
    expect(provider?.baseUrl).toBe("http://localhost:1234/v1");
    expect(result.models).toHaveLength(1);
    expect(result.models[0]?.id).toBe("qwen3.5-2b");
  });

  test("loads a well-formed project .jie/models.json", () => {
    const projJie = join(cwd, ".jie");
    mkdirSync(projJie, { recursive: true });
    writeFileSync(
      join(projJie, "models.json"),
      JSON.stringify({
        providers: {
          ollama: {
            baseUrl: "http://localhost:11434/v1",
            api: "openai-completions",
            apiKey: "ollama",
            models: [{ id: "llama3.1:8b" }],
          },
        },
      }),
    );
    const result = loadModelsConfig(homeJieDir, projJie);
    expect(result.providers.has("ollama")).toBe(true);
  });

  test("project overrides global per provider id", () => {
    const projJie = join(cwd, ".jie");
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": { baseUrl: "http://global:1234/v1", api: "openai-completions", models: [] },
          ollama: { baseUrl: "http://global-ollama:11434/v1", api: "openai-completions", models: [] },
        },
      }),
    );
    mkdirSync(projJie, { recursive: true });
    writeFileSync(
      join(projJie, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": { baseUrl: "http://project:5678/v1", api: "openai-completions", models: [{ id: "local-1" }] },
        },
      }),
    );
    const result = loadModelsConfig(homeJieDir, projJie);
    expect(result.providers.get("lm-studio")?.baseUrl).toBe("http://project:5678/v1");
    expect(result.providers.get("ollama")?.baseUrl).toBe("http://global-ollama:11434/v1");
    expect(result.models.find((m) => m.id === "local-1")).toBeDefined();
  });

  test.each([
    {
      name: "$ENV interpolation in apiKey",
      providerName: "anthropic",
      provider: {
        baseUrl: "https://api.anthropic.com",
        api: "anthropic-messages",
        apiKey: "$ANTHROPIC_TEST_KEY",
        models: [{ id: "claude-test" }],
      },
      env: { ANTHROPIC_TEST_KEY: "sk-test-123" },
      check: (result: ReturnType<typeof loadModelsConfig>) =>
        expect(result.providers.get("anthropic")?.apiKey).toBe("sk-test-123"),
    },
    {
      name: "${ENV} interpolation in headers",
      providerName: "custom",
      provider: {
        baseUrl: "https://example.com",
        api: "openai-completions",
        apiKey: "x",
        headers: { "x-org-id": "${TEST_ORG_ID}" },
        models: [],
      },
      env: { TEST_ORG_ID: "org-42" },
      check: (result: ReturnType<typeof loadModelsConfig>) =>
        expect(result.providers.get("custom")?.headers["x-org-id"]).toBe("org-42"),
    },
    {
      name: "${ENV} interpolation in baseUrl",
      providerName: "nvidia",
      provider: {
        baseUrl: "${TEST_BASE_URL}",
        api: "openai-completions",
        apiKey: "x",
        models: [],
      },
      env: { TEST_BASE_URL: "https://integrate.api.nvidia.com/v1" },
      check: (result: ReturnType<typeof loadModelsConfig>) =>
        expect(result.providers.get("nvidia")?.baseUrl).toBe("https://integrate.api.nvidia.com/v1"),
    },
    {
      name: "${ENV} interpolation in model.id and model.name",
      providerName: "nvidia",
      provider: {
        baseUrl: "https://example.com",
        api: "openai-completions",
        apiKey: "x",
        models: [{ id: "${TEST_MODEL_ID}", name: "${TEST_MODEL_NAME}" }],
      },
      env: {
        TEST_MODEL_ID: "nvidia/nemotron-3-nano-30b-a3b",
        TEST_MODEL_NAME: "Nemotron 3 Nano",
      },
      check: (result: ReturnType<typeof loadModelsConfig>) => {
        expect(result.models[0]?.id).toBe("nvidia/nemotron-3-nano-30b-a3b");
        expect(result.models[0]?.name).toBe("Nemotron 3 Nano");
      },
    },
  ])("$name", ({ providerName, provider, env, check }) => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({ providers: { [providerName]: provider } }),
    );
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
    try {
      const result = loadModelsConfig(homeJieDir, projectJieDir);
      check(result);
    } finally {
      for (const k of Object.keys(env)) delete process.env[k];
    }
  });

  test("missing env var resolves to empty string", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          custom: {
            baseUrl: "https://example.com",
            api: "openai-completions",
            apiKey: "$DEFINITELY_UNSET_VAR",
            models: [],
          },
        },
      }),
    );
    delete process.env.DEFINITELY_UNSET_VAR;
    const result = loadModelsConfig(homeJieDir, projectJieDir);
    expect(result.providers.get("custom")?.apiKey).toBe("");
  });

  test("malformed JSON throws with file path", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(join(homeJieDir, "models.json"), "{ broken");
    expect(() => loadModelsConfig(homeJieDir, projectJieDir)).toThrow(/models.json at/);
  });

  test("throws on unknown api", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          bad: { baseUrl: "https://x", api: "future-api", models: [] },
        },
      }),
    );
    expect(() => loadModelsConfig(homeJieDir, projectJieDir)).toThrow(/unknown api 'future-api'/);
  });

  test("throws when model.id is empty", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          bad: {
            baseUrl: "https://x",
            api: "openai-completions",
            models: [{ id: "" }],
          },
        },
      }),
    );
    expect(() => loadModelsConfig(homeJieDir, projectJieDir)).toThrow(/model.id is required/);
  });

  test("throws when baseUrl is missing", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          bad: { api: "openai-completions", models: [] },
        },
      }),
    );
    expect(() => loadModelsConfig(homeJieDir, projectJieDir)).toThrow(/baseUrl is required/);
  });

  test("full model config preserves optional fields", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": {
            baseUrl: "http://localhost:1234/v1",
            api: "openai-completions",
            apiKey: "x",
            compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
            models: [
              {
                id: "qwen3.5-2b",
                name: "Qwen 3.5 2B",
                reasoning: true,
                input: ["text"],
                contextWindow: 131528,
                maxTokens: 40960,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                compat: { maxTokensField: "max_completion_tokens" },
              },
            ],
          },
        },
      }),
    );
    const result = loadModelsConfig(homeJieDir, projectJieDir);
    const model = result.models[0];
    expect(model).toBeDefined();
    expect(model?.name).toBe("Qwen 3.5 2B");
    expect(model?.reasoning).toBe(true);
    expect(model?.contextWindow).toBe(131528);
    expect(model?.maxTokens).toBe(40960);
    expect((model?.compat as Record<string, unknown>).maxTokensField).toBe("max_completion_tokens");
  });
});

describe("resolveValue", () => {
  test("literal passes through", () => {
    expect(_resolveValue("sk-1234", "test")).toBe("sk-1234");
  });

  test("$VAR interpolation", () => {
    process.env.MY_VAR = "value";
    try {
      expect(_resolveValue("$MY_VAR", "test")).toBe("value");
    } finally {
      delete process.env.MY_VAR;
    }
  });

  test("${VAR} interpolation with literal text around it", () => {
    process.env.MY_VAR = "value";
    try {
      expect(_resolveValue("prefix-${MY_VAR}-suffix", "test")).toBe("prefix-value-suffix");
    } finally {
      delete process.env.MY_VAR;
    }
  });

  test("missing env var resolves to empty string", () => {
    delete process.env.NOT_SET_XYZ;
    expect(_resolveValue("$NOT_SET_XYZ", "test")).toBe("");
  });

  test("lowercase env var name is treated as literal (not interpolated)", () => {
    process.env.lowercase = "should-not-be-used";
    try {
      expect(_resolveValue("$lowercase", "test")).toBe("$lowercase");
    } finally {
      delete process.env.lowercase;
    }
  });
});

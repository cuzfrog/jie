import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadProjectProviderInputs } from "./project-models";

describe("project-models", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "jie-proj-models-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns empty map when no models.json", () => {
    const result = loadProjectProviderInputs(tmp);
    expect(result).toEqual({});
  });

  test("parses provider with baseUrl and apiKey", () => {
    writeFileSync(
      join(tmp, "models.json"),
      JSON.stringify({
        providers: {
          "lm-studio": {
            baseUrl: "http://localhost:1234/v1",
            api: "openai-completions",
            apiKey: "key-${MY_KEY}",
          },
        },
      }),
    );
    process.env.MY_KEY = "real";
    try {
      const result = loadProjectProviderInputs(tmp);
      expect(Object.keys(result)).toContain("lm-studio");
      expect(result["lm-studio"].baseUrl).toBe("http://localhost:1234/v1");
      expect(result["lm-studio"].api).toBe("openai-completions");
      expect(result["lm-studio"].apiKey).toBe("key-real");
    } finally {
      delete process.env.MY_KEY;
    }
  });

  test("interpolates env vars in headers", () => {
    writeFileSync(
      join(tmp, "models.json"),
      JSON.stringify({
        providers: {
          "proxy": {
            baseUrl: "https://proxy.example.com",
            headers: { "x-key": "${PROXY_KEY}" },
          },
        },
      }),
    );
    process.env.PROXY_KEY = "abc123";
    try {
      const result = loadProjectProviderInputs(tmp);
      expect(result.proxy.headers?.["x-key"]).toBe("abc123");
    } finally {
      delete process.env.PROXY_KEY;
    }
  });

  test("maps model definitions with defaults for missing fields", () => {
    writeFileSync(
      join(tmp, "models.json"),
      JSON.stringify({
        providers: {
          e2e: {
            baseUrl: "http://localhost:12346",
            api: "openai-completions",
            apiKey: "dummy",
            compat: { supportsDeveloperRole: false },
            models: [
              { id: "dummy", name: "dummy", contextWindow: 128000, maxTokens: 16384 },
              { id: "minimal" },
            ],
          },
        },
      }),
    );
    const result = loadProjectProviderInputs(tmp);
    const models = result.e2e.models!;
    expect(models).toHaveLength(2);
    expect(models[0]).toMatchObject({ id: "dummy", reasoning: false, input: ["text"], contextWindow: 128000, maxTokens: 16384 });
    expect(models[0].cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(models[1]).toMatchObject({ id: "minimal", name: "minimal", contextWindow: 128000, maxTokens: 16384 });
  });

  test("omits models when the provider declares none so builtin catalogs survive", () => {
    writeFileSync(
      join(tmp, "models.json"),
      JSON.stringify({ providers: { anthropic: { baseUrl: "https://proxy.example.com" } } }),
    );
    const result = loadProjectProviderInputs(tmp);
    expect(result.anthropic.models).toBeUndefined();
  });
});

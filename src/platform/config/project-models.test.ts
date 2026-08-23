import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
});

import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStoreImpl } from "./auth-store";

describe("AuthStoreImpl", () => {
  let homeDir: string;
  let homeJieDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-auth-"));
    homeJieDir = join(homeDir, ".jie");
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("load() on missing auth.json returns {}", () => {
    const store = new AuthStoreImpl(homeJieDir);
    expect(store.load()).toEqual({});
  });

  test("load() on corrupt auth.json returns {}", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(join(homeJieDir, "auth.json"), "{not-json");
    const store = new AuthStoreImpl(homeJieDir);
    expect(store.load()).toEqual({});
  });

  test("setProvider() persists a merged entry and writes auth.json with mode 0o600", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(join(homeJieDir, "auth.json"), JSON.stringify({ openai: { type: "api_key", key: "sk-o" } }));
    const store = new AuthStoreImpl(homeJieDir);
    store.setProvider("anthropic", "sk-a");
    const path = join(homeJieDir, "auth.json");
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({
      openai: { type: "api_key", key: "sk-o" },
      anthropic: { type: "api_key", key: "sk-a" },
    });
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  test("removeProvider() persists the entries without the removed key", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "auth.json"),
      JSON.stringify({ anthropic: { type: "api_key", key: "sk-a" }, openai: { type: "api_key", key: "sk-o" } }),
    );
    const store = new AuthStoreImpl(homeJieDir);
    store.removeProvider("anthropic");
    expect(JSON.parse(readFileSync(join(homeJieDir, "auth.json"), "utf-8"))).toEqual({
      openai: { type: "api_key", key: "sk-o" },
    });
  });

  test("clear() persists {}", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(join(homeJieDir, "auth.json"), JSON.stringify({ anthropic: { type: "api_key", key: "sk-a" } }));
    const store = new AuthStoreImpl(homeJieDir);
    store.clear();
    expect(JSON.parse(readFileSync(join(homeJieDir, "auth.json"), "utf-8"))).toEqual({});
  });
});

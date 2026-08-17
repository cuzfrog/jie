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

  test("read() returns the stored credential or undefined", async () => {
    const store = new AuthStoreImpl(homeJieDir);
    store.setProvider("anthropic", "sk-a");
    await expect(store.read("anthropic")).resolves.toEqual({ type: "api_key", key: "sk-a" });
    await expect(store.read("openai")).resolves.toBeUndefined();
  });

  test("list() returns provider ids with credential types", async () => {
    const store = new AuthStoreImpl(homeJieDir);
    store.setProvider("anthropic", "sk-a");
    store.setProvider("openai", "sk-o");
    const entries = await store.list();
    expect([...entries].sort((a, b) => a.providerId.localeCompare(b.providerId))).toEqual([
      { providerId: "anthropic", type: "api_key" },
      { providerId: "openai", type: "api_key" },
    ]);
  });

  test("modify() writes the returned credential and resolves it", async () => {
    const store = new AuthStoreImpl(homeJieDir);
    store.setProvider("anthropic", "sk-old");
    const result = await store.modify("anthropic", (current) => Promise.resolve({ type: "api_key", key: `${current?.key}-new` }));
    expect(result).toEqual({ type: "api_key", key: "sk-old-new" });
    expect(store.load()).toEqual({ anthropic: { type: "api_key", key: "sk-old-new" } });
  });

  test("modify() returning undefined leaves the entry unchanged and resolves the current credential", async () => {
    const store = new AuthStoreImpl(homeJieDir);
    store.setProvider("anthropic", "sk-old");
    const result = await store.modify("anthropic", () => Promise.resolve(undefined));
    expect(result).toEqual({ type: "api_key", key: "sk-old" });
    expect(store.load()).toEqual({ anthropic: { type: "api_key", key: "sk-old" } });
  });

  test("delete() removes the entry", async () => {
    const store = new AuthStoreImpl(homeJieDir);
    store.setProvider("anthropic", "sk-a");
    await store.delete("anthropic");
    expect(store.load()).toEqual({});
    await expect(store.delete("anthropic")).resolves.toBeUndefined();
  });
});

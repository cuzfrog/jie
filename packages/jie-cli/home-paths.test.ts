import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { resolveHomeDir } from "./home-paths.ts";

describe("resolveHomeDir", () => {
  let prevHome: string | undefined;

  beforeEach(() => {
    prevHome = process.env.HOME;
  });

  afterEach(() => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
  });

  test("returns process.env.HOME when set", () => {
    process.env.HOME = "/tmp/jie-cli-home";
    expect(resolveHomeDir()).toBe("/tmp/jie-cli-home");
  });

  test("returns process.env.HOME when set to empty string (treats empty as unset)", () => {
    process.env.HOME = "";
    expect(resolveHomeDir()).toBe(homedir());
  });

  test("falls back to os.homedir() when process.env.HOME is unset", () => {
    delete process.env.HOME;
    expect(resolveHomeDir()).toBe(homedir());
  });
});

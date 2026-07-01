import { runCommand } from "./index";

describe("runCommand", () => {
  test("/help returns reply with the help banner", () => {
    const out = runCommand("/help");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") {
      expect(out.text).toContain("/clear");
      expect(out.text).toContain("/team");
    }
  });

  test("/clear returns clearState outcome", () => {
    const out = runCommand("/clear");
    expect(out.kind).toBe("clearState");
  });

  test("/exit returns stop outcome", () => {
    const out = runCommand("/exit");
    expect(out.kind).toBe("stop");
  });

  test("/team with no argument returns reply prompting for an id", () => {
    const out = runCommand("/team");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") {
      expect(out.text).toContain("/team <id>");
    }
  });

  test("/team --unset returns reply about not-wired state", () => {
    const out = runCommand("/team --unset");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") {
      expect(out.text).toContain("--unset");
    }
  });

  test("/team foo returns reply about a team not being installed", () => {
    const out = runCommand("/team foo");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") {
      expect(out.text).toContain("foo");
      expect(out.text).toContain("not installed");
    }
  });

  test("/login returns reply pointing users at the CLI subcommand", () => {
    const out = runCommand("/login");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") {
      expect(out.text).toContain("jie login");
    }
  });

  test("/logout returns reply pointing users at the CLI subcommand", () => {
    const out = runCommand("/logout");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") {
      expect(out.text).toContain("jie logout");
    }
  });

  test("/model returns reply pointing users at the CLI subcommand", () => {
    const out = runCommand("/model");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") {
      expect(out.text).toContain("jie model");
    }
  });

  test("unknown slash command returns error outcome", () => {
    const out = runCommand("/nope");
    expect(out.kind).toBe("error");
    if (out.kind === "error") {
      expect(out.text).toContain("/nope");
    }
  });

  test("trailing whitespace does not break command parsing", () => {
    const out = runCommand("/help   ");
    expect(out.kind).toBe("reply");
  });
});

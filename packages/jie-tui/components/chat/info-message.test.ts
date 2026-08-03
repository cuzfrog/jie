import { visibleWidth } from "@earendil-works/pi-tui";
import { type InfoEntry } from "../../state";
import { InfoMessage } from "./info-message";

const HELP: InfoEntry = { seq: 0, kind: "help" };

describe("InfoMessage", () => {
  test("a help entry omits the mark and the identity header", () => {
    const text = new InfoMessage(HELP).render(200).map(stripAnsi).join("\n");
    expect(text).not.toContain("█");
    expect(text).not.toContain("(jiè)");
    expect(text).not.toContain("Teams:");
  });

  test("a help entry omits the team roster", () => {
    const text = new InfoMessage(HELP).render(200).map(stripAnsi).join("\n");
    expect(text).not.toContain("general-1");
  });

  test("a help entry reprints the key hints", () => {
    const text = new InfoMessage(HELP).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("mention a file");
    expect(text).toContain("ctrl+d quit");
  });

  test("a help entry lists every slash command including /resume", () => {
    const text = new InfoMessage(HELP).render(200).map(stripAnsi).join("\n");
    const commands = [
      "/help", "/clear", "/exit", "/team", "/resume", "/rename", "/model", "/model-filter", "/effort", "/login", "/logout",
    ];
    for (const command of commands) {
      expect(text).toContain(command);
    }
  });

  test("a help entry shows argument hints and descriptions under a Commands heading", () => {
    const text = new InfoMessage(HELP).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("Commands");
    expect(text).toContain("<provider> <apiKey>");
    expect(text).toContain("resume a session of the loaded team");
  });

  test("a help entry shows the key hints under a Shortcuts heading", () => {
    const text = new InfoMessage(HELP).render(200).map(stripAnsi).join("\n");
    expect(text).toContain("Shortcuts");
    expect(text).toContain("enter send");
  });

  test("every help line fits the given width", () => {
    const info = new InfoMessage(HELP);
    for (const width of [13, 40, 60, 80, 139]) {
      for (const line of info.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

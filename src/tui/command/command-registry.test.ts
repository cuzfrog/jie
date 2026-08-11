import { COMMAND_METADATA, resolveCommandName } from "./command-registry";
import { SLASH_COMMANDS } from "./definitions";

describe("slash command registry invariants", () => {
  test("SLASH_COMMANDS is the single authoritative list", () => {
    expect(SLASH_COMMANDS.length).toBeGreaterThan(0);
    expect(COMMAND_METADATA.length).toBe(SLASH_COMMANDS.length);
    expect(SLASH_COMMANDS.every((command, index) => command.meta === COMMAND_METADATA[index])).toBe(true);
  });

  test("every command has a unique canonical name", () => {
    const names = new Set<string>();
    for (const command of SLASH_COMMANDS) {
      expect(names.has(command.meta.name)).toBe(false);
      names.add(command.meta.name);
    }
  });

  test("aliases point to distinct canonical commands", () => {
    const seenAliases = new Set<string>();
    for (const command of SLASH_COMMANDS) {
      for (const alias of command.meta.aliases ?? []) {
        expect(seenAliases.has(alias)).toBe(false);
        expect(alias).not.toBe(command.meta.name);
        seenAliases.add(alias);
      }
    }
  });

  test("resolveCommandName maps aliases to canonical names and leaves unknown names intact", () => {
    expect(resolveCommandName("new")).toBe("clear");
    expect(resolveCommandName("clear")).toBe("clear");
    expect(resolveCommandName("nope")).toBe("nope");
  });
});

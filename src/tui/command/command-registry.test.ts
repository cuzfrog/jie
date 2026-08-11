import { CommandRegistryImpl } from "./command-registry";

describe("slash command registry invariants", () => {
  const registry = new CommandRegistryImpl();

  test("commands is the single authoritative list", () => {
    expect(registry.commands.length).toBeGreaterThan(0);
    expect(registry.metadata.length).toBe(registry.commands.length);
    expect(registry.commands.every((command, index) => command.meta === registry.metadata[index])).toBe(true);
  });

  test("every command has a unique canonical name", () => {
    const names = new Set<string>();
    for (const command of registry.commands) {
      expect(names.has(command.meta.name)).toBe(false);
      names.add(command.meta.name);
    }
  });

  test("aliases point to distinct canonical commands", () => {
    const seenAliases = new Set<string>();
    for (const command of registry.commands) {
      for (const alias of command.meta.aliases ?? []) {
        expect(seenAliases.has(alias)).toBe(false);
        expect(alias).not.toBe(command.meta.name);
        seenAliases.add(alias);
      }
    }
  });

  test("resolveCommandName maps aliases to canonical names and leaves unknown names intact", () => {
    expect(registry.resolveCommandName("new")).toBe("clear");
    expect(registry.resolveCommandName("clear")).toBe("clear");
    expect(registry.resolveCommandName("nope")).toBe("nope");
  });
});

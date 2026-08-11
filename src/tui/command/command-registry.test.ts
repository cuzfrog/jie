import { SLASH_COMMANDS } from "./definitions";
import { CommandRegistryImpl } from "./command-registry";

describe("slash command catalog", () => {
  const registry = new CommandRegistryImpl();

  test("metadata is the single authoritative list", () => {
    expect(registry.metadata.length).toBe(SLASH_COMMANDS.length);
    expect(registry.metadata.every((meta, index) => meta === SLASH_COMMANDS[index].meta)).toBe(true);
  });

  test("every command has a unique canonical name", () => {
    const names = new Set<string>();
    for (const meta of registry.metadata) {
      expect(names.has(meta.name)).toBe(false);
      names.add(meta.name);
    }
  });

  test("aliases point to distinct canonical commands", () => {
    const seenAliases = new Set<string>();
    for (const meta of registry.metadata) {
      for (const alias of meta.aliases ?? []) {
        expect(seenAliases.has(alias)).toBe(false);
        expect(alias).not.toBe(meta.name);
        seenAliases.add(alias);
      }
    }
  });

  test("commandMeta returns metadata for canonical names and aliases", () => {
    expect(registry.commandMeta("new")?.name).toBe("clear");
    expect(registry.commandMeta("clear")?.name).toBe("clear");
    expect(registry.commandMeta("nope")).toBeNull();
  });

  test("findCommand returns the command for canonical names and aliases", () => {
    expect(registry.findCommand("new")?.meta.name).toBe("clear");
    expect(registry.findCommand("clear")?.meta.name).toBe("clear");
    expect(registry.findCommand("nope")).toBeNull();
  });
});

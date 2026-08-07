import { SLASH_COMMAND_NAMES } from "./command-handler";
import { COMMAND_METADATA } from "./command-metadata";

const ALL_COMMAND_NAMES = COMMAND_METADATA.flatMap((command) => [command.name, ...(command.aliases ?? [])]);
const ALIAS_NAMES = COMMAND_METADATA.flatMap((command) => command.aliases ?? []);

function canonicalNames(): string[] {
  return COMMAND_METADATA.map((command) => command.name);
}

describe("COMMAND_METADATA", () => {
  test("slash command names include every canonical command and alias in registry order", () => {
    expect(ALL_COMMAND_NAMES).toEqual([...SLASH_COMMAND_NAMES]);
  });

  test("canonical command names match the registry order and do not include aliases", () => {
    expect(canonicalNames()).toEqual([...SLASH_COMMAND_NAMES].filter((name) => !ALIAS_NAMES.includes(name)));
  });

  test("every command carries a non-empty description", () => {
    for (const command of COMMAND_METADATA) {
      expect(command.description.length).toBeGreaterThan(0);
    }
  });
});

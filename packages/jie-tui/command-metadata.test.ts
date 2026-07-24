import { SLASH_COMMAND_NAMES } from "./command-handler";
import { COMMAND_METADATA } from "./command-metadata";

describe("COMMAND_METADATA", () => {
  test("describes every slash command once, in registry order", () => {
    expect(COMMAND_METADATA.map((command) => command.name)).toEqual([...SLASH_COMMAND_NAMES]);
  });

  test("every command carries a non-empty description", () => {
    for (const command of COMMAND_METADATA) {
      expect(command.description.length).toBeGreaterThan(0);
    }
  });
});

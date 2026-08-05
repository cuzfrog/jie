import type { WriteGateRule } from "../types";
import { JiePlatformError } from "../jie-platform-errors";

export function checkWriteGates(
  relativePath: string,
  agentRole: string,
  writeGates: ReadonlyArray<WriteGateRule>,
): void {
  for (const gate of writeGates) {
    if (!new Bun.Glob(gate.pattern).match(relativePath)) continue;
    if (!gate.roles.includes(agentRole) && !gate.roles.includes("any")) {
      throw new JiePlatformError("WRITE_GATE_DENIED", {
        detail: `path '${relativePath}' matches write gate '${gate.pattern}' (allowed roles: ${gate.roles.join(", ")})`,
      });
    }
  }
}

import type { JiePlatform } from "@cuzfrog/jie-platform";
import type { PrintResult } from "@cuzfrog/jie-platform/command";
import type { ParsedArgsMap } from "../cli-flags";

export type PrintArgs = ParsedArgsMap["print"];

export async function runPrint(handle: JiePlatform, args: PrintArgs): Promise<number> {
  const result: PrintResult = await handle.command("print", {
    instruction: args.instruction,
    timeout: args.timeout,
    json: args.json,
  });
  return mapPrintResult(result, args.timeout);
}

function mapPrintResult(result: PrintResult, timeoutSec: number): number {
  switch (result.kind) {
    case "ok":
      return 0;
    case "timeout":
      console.error(`no response from team within ${timeoutSec}s`);
      return 3;
    case "error":
      console.error(result.message);
      return 1;
  }
}

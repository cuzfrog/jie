import type { ArgumentSpec, SlashArgument, SlashCompletion, SlashContext } from "../slash-command";

export class StringArgument implements SlashArgument {
  readonly spec: ArgumentSpec;

  constructor(name: string, options?: { readonly optional?: boolean; readonly greedy?: boolean }) {
    this.spec = { name, optional: options?.optional, greedy: options?.greedy };
  }

  complete(_prefix: string, _context: SlashContext): SlashCompletion | null {
    return null;
  }
}

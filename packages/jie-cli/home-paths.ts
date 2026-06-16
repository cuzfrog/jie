/** HOME directory resolution.
 *
 *  `os.homedir()` in Bun caches its value at startup and does not
 *  honor runtime `process.env.HOME` changes (which the test suite
 *  uses to redirect HOME). Reading `process.env.HOME` directly lets
 *  tests override HOME for hermetic command runs.
 */
import { homedir } from "node:os";

export function resolveHomeDir(): string {
  const fromEnv = process.env.HOME;
  return fromEnv !== undefined && fromEnv !== "" ? fromEnv : homedir();
}

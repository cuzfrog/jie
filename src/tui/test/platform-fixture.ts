import type { JiePlatform } from "../../platform";

export function makePlatform(): { readonly platform: JiePlatform; readonly execute: ReturnType<typeof vi.fn>; } {
  const platform = vi.mocked<JiePlatform>({
    settings: {},
    subscribe: vi.fn(() => () => undefined),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    dequeuePrompt: vi.fn(),
    requeuePrompt: vi.fn(),
    teams: vi.fn(() => []),
    execute: vi.fn(async () => null),
    shutdown: vi.fn(),
  });
  return { platform, execute: platform.execute };
}

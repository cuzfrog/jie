# Mock in test

## Example

```typescript
interface FooService {
  getName: (id: string) => string;
}

// mock interface type
const mockFooService = vi.mocked<FooService>({
  getName: (id: string) => vi.fn(),
});

// now you can call `mockFooService.getName.mock*`
```

## How does it work?

`vi.mocked` is added onto the global namespace in `tests/test-setup.ts`. The file also installs a global `beforeEach` that calls `vi.resetAllMocks()` and `vi.restoreAllMocks()` between tests for max isolation. This wipes both sticky `mockReturnValue` and the `mockReturnValueOnce` queue between tests.

## Pattern: file-top mocks, reused across tests

Define mocks at the top of the test file, above `describe`. The same mock object is reused across every test in the file; only its behavior is reset between tests by the global `beforeEach`.

```typescript
const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  write: vi.fn(),
  unsetDefaultTeam: vi.fn(),
});
```

## Per-test and per-describe configuration

Because the global reset wipes everything, the file's `beforeEach` inside `describe` is the right place to set the default behavior for the suite:

```typescript
describe("createApp", () => {
  beforeEach(() => {
    settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
  });

  test("happy path uses default settings", () => {
    // settingsStore.load returns DEFAULT_SETTINGS
  });

  test("no model in settings throws", () => {
    settingsStore.load.mockReturnValueOnce({});
    // first call returns {}, subsequent calls fall back to DEFAULT_SETTINGS
  });
});
```

- `mockReturnValue` (sticky) — set in `beforeEach` for a default.
- `mockReturnValueOnce` (one-shot) — set in the test body to override the next call only.

## Do not import `bun:test`

All test utilities are on the global namespace. Use bare names, e.g.:
(`test`, `describe`, `expect`, `vi`, `vi.fn`, `vi.spyOn`).

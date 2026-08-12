import type { AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";
import { PathCompletionSource } from "./path-completion-source";

function signal(): AbortSignal {
  return new AbortController().signal;
}

function makeProvider(suggestions: AutocompleteSuggestions | null): AutocompleteProvider {
  return vi.mocked<AutocompleteProvider>({
    getSuggestions: vi.fn(async () => suggestions),
    applyCompletion: vi.fn(),
  });
}

describe("PathCompletionSource", () => {
  test("plain text yields no suggestions", async () => {
    const suggestions = await new PathCompletionSource(makeProvider(null)).getSuggestions(["hello"], 0, 5, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("forwards provider suggestions", async () => {
    const expected: AutocompleteSuggestions = {
      items: [{ value: "bar.txt", label: "bar.txt" }, { value: "foo.txt", label: "foo.txt" }],
      prefix: "cat ",
    };
    const suggestions = await new PathCompletionSource(makeProvider(expected)).getSuggestions(["cat "], 0, 4, { signal: signal() });
    expect(suggestions).toEqual(expected);
  });
});

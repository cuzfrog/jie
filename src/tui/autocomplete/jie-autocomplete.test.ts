import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";
import type { CompletionSource } from "./completion-source";
import { JieAutocompleteProviderImpl } from "./jie-autocomplete";

function signal(): AbortSignal {
  return new AbortController().signal;
}

function makeProvider(
  sources: ReadonlyArray<CompletionSource> = [],
  applier: AutocompleteProvider = makeApplier(),
): JieAutocompleteProviderImpl {
  return new JieAutocompleteProviderImpl(sources, applier);
}

function makeApplier(): AutocompleteProvider {
  return {
    getSuggestions: vi.fn<AutocompleteProvider["getSuggestions"]>(async () => null),
    applyCompletion: vi.fn<AutocompleteProvider["applyCompletion"]>(() => ({ lines: [], cursorLine: 0, cursorCol: 0 })),
  };
}

function makeSource(
  items: AutocompleteItem[],
  prefix: string,
  filteredOut?: number,
  triggerCharacters: ReadonlyArray<string> = ["/"],
): CompletionSource {
  return {
    triggerCharacters,
    getSuggestions: vi.fn<CompletionSource["getSuggestions"]>(async () => ({ items, prefix, ...(filteredOut !== undefined ? { filteredOut } : undefined) })),
  };
}

describe("JieAutocompleteProviderImpl", () => {
  test("plain text yields no suggestions", async () => {
    const provider = makeProvider();
    const suggestions = await provider.getSuggestions(["hello"], 0, 5, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("returns the first non-null suggestion", async () => {
    const source = makeSource([{ value: "foo", label: "foo" }], "/f");
    const provider = makeProvider([source]);
    const suggestions = await provider.getSuggestions(["/f"], 0, 2, { signal: signal() });
    expect(suggestions).toEqual({ items: [{ value: "foo", label: "foo" }], prefix: "/f" });
  });

  test("merges suggestions from multiple non-exclusive sources", async () => {
    const source1 = makeSource([{ value: "foo", label: "foo" }], "/");
    const source2 = makeSource([{ value: "bar", label: "bar" }], "/", 2);
    const provider = makeProvider([source1, source2]);
    const suggestions = await provider.getSuggestions(["/"], 0, 1, { signal: signal() });
    expect(suggestions).toEqual({
      items: [{ value: "foo", label: "foo" }, { value: "bar", label: "bar" }],
      prefix: "/",
      filteredOut: 2,
    });
  });

  test("short-circuits on an exclusive source and skips later sources", async () => {
    const exclusive: CompletionSource = {
      triggerCharacters: ["@"],
      exclusive: true,
      getSuggestions: vi.fn<CompletionSource["getSuggestions"]>(async () => ({ items: [{ value: "exclusive", label: "exclusive" }], prefix: "@" })),
    };
    const later: CompletionSource = {
      triggerCharacters: ["/"],
      getSuggestions: vi.fn<CompletionSource["getSuggestions"]>(async () => ({ items: [{ value: "later", label: "later" }], prefix: "/" })),
    };

    const provider = makeProvider([exclusive, later]);
    const suggestions = await provider.getSuggestions(["@"], 0, 1, { signal: signal() });
    expect(suggestions!.items).toEqual([{ value: "exclusive", label: "exclusive" }]);
    expect(later.getSuggestions).not.toHaveBeenCalled();
  });

  test("applyCompletion forwards arguments to the injected applier", () => {
    const applyCompletion = vi.fn<AutocompleteProvider["applyCompletion"]>(() => ({ lines: ["replaced"], cursorLine: 0, cursorCol: 9 }));
    const applier: AutocompleteProvider = {
      getSuggestions: vi.fn<AutocompleteProvider["getSuggestions"]>(async () => null),
      applyCompletion,
    };
    const provider = makeProvider([], applier);
    const item = { value: "@@src/main.ts", label: "src/main.ts" };
    const result = provider.applyCompletion(["@@mai"], 0, 5, item, "@@mai");
    expect(applyCompletion).toHaveBeenCalledWith(["@@mai"], 0, 5, item, "@@mai");
    expect(result).toEqual({ lines: ["replaced"], cursorLine: 0, cursorCol: 9 });
  });
});

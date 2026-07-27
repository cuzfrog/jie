export function unavailabilityGuidance(indexPath: string): string {
  return [
    `code-lens is not available since no SCIP index is available (looked for ${indexPath}).`,
    "code-lens is a read-only consumer of SCIP indexes; it never runs an indexer itself.",
    "Generate an index with the indexer for your language, then point code-lens at the produced index.scip:",
    "- TypeScript/JavaScript: npm install -g @sourcegraph/scip-typescript, then run `scip-typescript index` in the project root.",
    "- Python: pip install scip-python, then run `scip-python index` in the project root.",
    "- Java/Kotlin: install scip-java (github.com/sourcegraph/scip-java releases), then run `scip-java index` at the build root.",
    "- Rust: cargo install scip, then run `scip` in the crate root (rust-analyzer based).",
    "- Go: go install github.com/sourcegraph/scip-go/cmd/scip-go@latest, then run `scip-go` in the module root.",
    "Each indexer writes an index.scip file at the project root.",
  ].join("\n");
}

# Error banner

Renders the `errorBanner` slice of `TuiState` as a single-line banner above
the editor. The banner sticks until `clearErrorMessage` is dispatched, so the
user has time to read it.

The transient banner (`components/transient-banner`) is its sibling and
auto-clears after 5s; the error banner is intentionally sticky because the
underlying problem is not time-sensitive.

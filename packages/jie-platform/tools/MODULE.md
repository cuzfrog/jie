---
sealed:
  - artifact.test.ts
  - bash.test.ts
  - bash.ts
  - index.ts
  - notify.test.ts
  - notify.ts
  - path-utils.ts
  - read-artifact.test.ts
  - read-artifact.ts
  - read-file.test.ts
  - read-file.ts
  - tool-registry.test.ts
  - tool-registry.ts
  - types.ts
  - web-fetch.test.ts
  - web-fetch.ts
  - web-search.test.ts
  - web-search.ts
  - write-artifact.test.ts
  - write-artifact.ts
  - write-file.test.ts
  - write-file.ts
---

# Notes
- tools' types should not escape from this module. Tools should be registered without an external caller knowing them.
- `toolRegistry` instance is exported for jie-platform to register MCP and user custom tools.

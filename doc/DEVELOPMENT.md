# Development Guide

## Local Setup
1. install `bun`
2. setup local inference endpoint at `http://192.168.1.6:12345` (OpenAI compatible); use model `qwen3.5-2b` (small and fast).

## Run tests

```bash
# Unit tests (no LLM required)
bun test packages/jie-platform/start.test.ts
bun test tests/e2e/event-order.test.ts tests/e2e/memory-roundtrip.test.ts

# All stub tests (no LLM required)
bun test packages/jie-platform/start.test.ts tests/e2e/event-order.test.ts tests/e2e/memory-roundtrip.test.ts

# Real-LLM e2e tests (requires LM Studio or compatible endpoint)
JIE_E2E_LLM_BASE_URL=http://192.168.1.6:12345 bun test tests/e2e/v1-scenarios.test.ts
```

## Invoke jie CLI directly from source

```bash
# Show help
bun -e "import {main} from './packages/jie-cli/index.ts'; await main(['--help'])"

# Show version
bun -e "import {main} from './packages/jie-cli/index.ts'; await main(['--version'])"

# Run with print mode (requires API key and model configured)
bun -e "import {main} from './packages/jie-cli/index.ts'; await main(['--print', 'hello world'])"

# Run with custom team and timeout
bun -e "import {main} from './packages/jie-cli/index.ts'; await main(['--print', 'hello world', '--team', 'minimal', '--timeout', '60'])"

# Login with API key
bun -e "import {main} from './packages/jie-cli/index.ts'; await main(['login', '--provider', 'anthropic', '--api-key', 'sk-xxx'])"

# Set default model
bun -e "import {main} from './packages/jie-cli/index.ts'; await main(['model', 'anthropic/claude-sonnet-4'])"

# List/set default team
bun -e "import {main} from './packages/jie-cli/index.ts'; await main(['team'])"
bun -e "import {main} from './packages/jie-cli/index.ts'; await main(['team', 'minimal'])"
```

## Programmatic usage (for testing)

```typescript
import { main, runCli, runPrintCli } from "./packages/jie-cli/index.ts";

// Direct function call (used by tests)
await main(["--print", "hello world"]);
await runCli(parsed, cwd, argv);
await runPrintCli(parsed, cwd, hooks);
```
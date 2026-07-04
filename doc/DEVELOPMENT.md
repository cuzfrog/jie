# Development Guide

## Local Setup
1. install `bun` 1.3.14
2. setup local inference endpoint at `http://192.168.1.6:12345` (OpenAI compatible, set temperature to 0); use model `qwen3.5-2b` (small and fast).
3. run `. ./setenv` to populate environment variables for local development.

## Run tests

```bash
# Unit tests (no LLM required)
bun test packages

# End-to-end tests
bun test tests/e2e
```

## Invoke jie CLI
Setup:
- `.jie/settings.json`
- `.jie/models.json`

```bash
bun link
jie --version
jie -p "Tell me a joke."
```

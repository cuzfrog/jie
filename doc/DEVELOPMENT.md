# Development Guide

## Prerequisite
1. install `bun` 1.3.14

## Local LLM setup (optional)
1. setup local inference endpoint at `http://192.168.1.6:12345` (OpenAI compatible, set temperature to 0); use model `qwen3.5-2b` (small and fast).
2. run `. ./setenv` to populate environment variables for local development. It sets JIE_E2E_BASE_URL=http://localhost:12345 for real LLM backend

## Run tests

```bash
# Unit tests (no LLM required)
bun test packages

# End-to-end tests
bun mock:start # to start the mock LLM backend
bun test:e2e:mock # it sets JIE_E2E_BASE_URL=http://localhost:12346 for mock LLM backend
```
- With mock LLM backend, test should be finished within 5s, do not increase timeout.

## Invoke jie CLI
Setup:
- `.jie/settings.json`
- `.jie/models.json`

```bash
bun link
jie --version
jie -p "Tell me a joke."
```

## Logging
Configure the level via env var `JIE_LOG_LEVEL`. Accepted values (case-insensitive): `SILLY`, `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`. When unset the logger is silent.

# Development Guide

## Prerequisite
1. install `bun` 1.3.14

## Local LLM setup (optional)
For manual exploration with a real backend, configure `.jie/models.json` and run `jie -p "..."`.

## Run tests

```bash
# Unit tests (no LLM required)
bun test packages

# End-to-end tests (mock LLM backend only)
bun mock:start # start the mock LLM backend
bun test:e2e:mock
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

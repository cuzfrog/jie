# Development Guide

## Local Setup
1. install `bun`
2. setup local inference endpoint at `http://192.168.1.6:12345` (OpenAI compatible); use model `qwen3.5-2b` (small and fast).

## Run tests

```bash
# Unit tests (no LLM required)
bun test packages/jie-platform
bun test tests/e2e
```

## Invoke jie CLI directly from source

```bash

```

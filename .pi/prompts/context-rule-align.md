---
name: context-rule-align
description: Review the repo by spawning a fleet of subagents covering a whole matrix of angles according to context rules, and fix.
disable-model-invocation: true
argument-hint: <scope>
---

## Input
- scope: $ARGUMENTS

## Instructions
1. build multiple lists of all dimensions one by one, save to a tmp file.
2. build a matrix of angles according to lists of dimensions, save to a tmp file.
3. spawn a fleet of subagents to review the repo from each angle (every cell in the matrix is an angle). E.g., there are 30 bullets gathered, and 5 modules, you should spawn 30x5=150 subagents.
4. do not reduce the scope, no matter how many files or lines of code are subject to change. Divide and conquer.
5. fix issues one by one using skill /code-improve. Each fix should be a separate git commit.

## Dimensions
1. modules and packages, e.g. directories under `packages/`. Respect user input scope.
2. every bullet point (starting with a `-`) in `Code Conventions`, `Test`, `Single file layout`, `Coding Principles`, `Things to avoid` sections in CLAUDE.md

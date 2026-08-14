# Merge a Pull Request after CI is Green

Use this skill to finalize a PR by watching its GitHub checks and merging it once they pass. If no PR exists for the current branch, create one first and then merge it.

## Preconditions

- The repository has a `.github/workflows/test.yml` CI pipeline.
- The current branch is a `dev_*` or `fix_*` branch and has already been pushed to `origin`.
- The `scripts/merge-pr.ts` script is the canonical merge helper.
- Tests and type-checking pass before opening a new PR.

## Steps

1. Identify the PR number for the current branch.
   - Run `./scripts/gh-bot.mjs pr list` to list open PRs.
   - If a PR is already open for the current branch, use its number.
   - If no PR is open, create one from the current branch:
     - Ensure the latest changes are committed and pushed to `origin`.
     - Use the `gh-bot` skill or run:
       ```
       ./scripts/gh-bot.mjs pr create --base main --title "<semantic title>" --body "<summary and test plan>"
       ```
     - Note the new PR number.
2. Run the merge watcher with the PR number:
   ```
   bun run scripts/merge-pr.ts <pr-number>
   ```
3. The script:
   - Polls `gh pr checks --watch --fail-fast` until all checks complete.
   - Reports failing check names if any fail and exits non-zero.
   - If checks pass, merges the PR using `gh api` with the default `squash` method.
   - Checks out `main`, fast-forwards it, prunes remotes, and optionally deletes the local branch.
4. Do not claim the PR is merged until the script prints the success line and exits with code `0`.

## Optional flags

- `--method rebase|merge` overrides the default `squash` merge method.
- `--delete` deletes the local PR branch after a successful merge.

## Example

```
bun run scripts/merge-pr.ts 42
```

## Failure handling

- If checks fail, fix the issues on the same branch, push again, and rerun the script.
- If the script exits with a `gh` authentication or network error, check that the GitHub App token is fresh (`./scripts/gh-bot.mjs`) and retry. `gh` is used to merge PRs, `gh-bot` cannot merge PRs.

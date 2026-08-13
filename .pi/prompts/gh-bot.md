---
name: gh-bot
description: Prepare, commit, push, and open a pull request in the jie repository using the gh-bot.mjs GitHub App wrapper.
---

Use this skill when the user wants to commit changes, push a branch, and open a PR from the local jie repository.

## Preconditions

- You are on a branch named `dev_*` or `fix_*`.
- Tests and typecheck have passed for the current changes.
- `.env` at the project root contains `GH_APP_ID`, `GH_INSTALLATION_ID`, and `GH_APP_PRIVATE_KEY_PATH`.

## Workflow

1. Verify the working tree:
   - `git status --short`
   - `git diff --stat`
   - Inspect the diff for secrets or unrelated changes.

2. Stage and commit:
   - `git add -A`
   - Run the project commit command:
     ```bash
     git commit -m "$(cat <<'EOF'
     <type>([optional task_id]): <why this change>.

     Generated with [Devin](https://devin.ai)

     Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>
     EOF
     )"
     ```
   - Follow `doc/AGENTS_GIT.md` for PR title and commit conventions.
   - No emojis, no agent names, and no per-file details.

3. Push:
   - `git push -u origin $(git branch --show-current)`

4. Open the PR with the gh-bot wrapper (do not use `gh` directly for this):
   ```bash
   ./scripts/gh-bot.mjs pr create \
     --base main \
     --title "<type>([optional task_id]): <description>" \
     --body "$(cat <<'EOF'
   ## Summary
   - <bullet points>

   #### Test plan
   - [x] `bunx tsc --noEmit`
   - [x] `bun test src`

   Generated with [Devin](https://devin.ai)
   EOF
   )"
   ```

## Example

```bash
./scripts/gh-bot.mjs pr create \
  --base main \
  --title "feat(teams): jie-assisted-developer uses call_agent" \
  --body "$(cat <<'EOF'
## Summary
- Replace task.* pub/sub with call_agent.
- Add explorer and steward as shared callees.

#### Test plan
- [x] `bun test src` — 2785 pass, 0 fail
- [x] `bunx tsc --noEmit`

Generated with [Devin](https://devin.ai)
EOF
)"
```

## Failure handling

- If `gh-bot` fails with an auth error, verify `.env` and the private key file at `~/.github/abao-bot.2026-05-22.private-key.pem` exist.
- Do not push if `bun test src` or `bunx tsc --noEmit` fails.
- For merging an already-open PR, use the `merge-pr` skill.

## User Instructions
$ARGUMENTS

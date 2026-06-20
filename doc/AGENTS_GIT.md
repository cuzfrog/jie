## Git

- When milestone is reached, update version in `package.json`.
- Keep your PR comments concise and clear. Reply in a review thread.

### branching
- Main branch: `main`
- Feature branches: `<task_id>_<short-description>`, e.g., `ISSUE-2_config-loader`
- User branches: `dev_*`, `fix_`.

### PR title - semantic-pull-request format:
<type>([optional task_id]): <description>
```yaml
types:
  - feat
  - fix
  - docs
  - style
  - refactor
  - perf
  - test
  - chore
  - ci
```

### PR Squash commit message
- Do not contain any individual commits. Use the github template.

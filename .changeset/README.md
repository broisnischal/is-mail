# Changesets

Use Changesets for all user-facing changes.

## Create a changeset

```bash
bun run changeset
```

Select `is-mail` and choose the version bump (`patch`, `minor`, or `major`), then describe the change.

## Release flow

- Open PRs with code changes and at least one `.changeset/*.md` file.
- CI validates build + tests and checks changeset state.
- On merge to `master`, the release workflow creates/updates a version PR.
- Merging the version PR publishes to npm using `NPM_TOKEN`.

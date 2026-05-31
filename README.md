# dependabot-npm-force-overrides

GitHub Action for npm Dependabot PRs.

It makes transitive dependency updates durable by keeping `package.json` `overrides` in sync with
the version resolved in `package-lock.json`.

This action is npm-only.

## Quickstart

```yaml
name: Dependabot npm overrides

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: write

jobs:
  overrides:
    if: github.actor == 'dependabot[bot]'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.ref }}

      - uses: your-org/dependabot-npm-force-overrides@v1
        id: overrides
        with:
          mode: commit

      - name: Push changes
        if: steps.overrides.outputs.committed == 'true'
        run: git push
```

## What It Does

- Detects npm `package-lock.json` changes in Dependabot PRs.
- Finds transitive dependency version bumps.
- Adds or updates `package.json` `overrides`.
- Uses minimum-version overrides, for example `"foo": ">=1.2.4"`.
- Runs `npm install --package-lock-only --ignore-scripts`.
- Sets `npm_config_ignore_scripts=true`.
- Refuses direct dependency lockfile-only updates by default.

## Modes

### `check`

Runs without file writes.

```yaml
- uses: your-org/dependabot-npm-force-overrides@v1
  with:
    mode: check
```

### `commit`

Writes override changes, refreshes the lockfile, and creates a local commit.

```yaml
- uses: your-org/dependabot-npm-force-overrides@v1
  id: overrides
  with:
    mode: commit

- if: steps.overrides.outputs.committed == 'true'
  run: git push
```

### `comment`

Reserved.

## Inputs

| Input                          | Default               | Description                                                           |
| ------------------------------ | --------------------- | --------------------------------------------------------------------- |
| `github-token`                 | `${{ github.token }}` | GitHub token for modes that need repository access.                   |
| `mode`                         | `check`               | `check`, `comment`, or `commit`.                                      |
| `dry-run`                      | `false`               | Report planned work without writing files, commenting, or committing. |
| `package-roots`                | auto-detect           | Newline or comma separated npm package roots.                         |
| `allowed-bot-logins`           | `dependabot[bot]`     | Bot logins allowed to mutate PR branches.                             |
| `override-strategy`            | `minimum`             | Override style. Only `minimum` is supported.                          |
| `security-only`                | `false`               | Reserved for security-only filtering.                                 |
| `fail-on-direct-lockfile-only` | `true`                | Fail direct dependency lockfile-only updates.                         |
| `skip-label`                   | unset                 | PR label that causes the action to no-op.                             |

## Outputs

| Output          | Description                                 |
| --------------- | ------------------------------------------- |
| `changed`       | Whether files were changed.                 |
| `committed`     | Whether commit mode created a local commit. |
| `mode`          | Effective mode.                             |
| `dry-run`       | Whether dry-run mode was enabled.           |
| `would-write`   | Whether the selected mode may write files.  |
| `would-comment` | Whether the selected mode may comment.      |
| `would-commit`  | Whether the selected mode may commit.       |

## Supported

- npm
- `package.json`
- `package-lock.json` lockfile versions 2 and 3
- root and nested npm package roots
- scoped packages

## Not Supported

- Yarn
- pnpm
- Bun
- non-npm Dependabot ecosystems
- direct dependency updates through `overrides`

## Release Tags

Use immutable semver tags and moving major tags:

- `v1.2.3`
- `v1`

Do not use `latest`.

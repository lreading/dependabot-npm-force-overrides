# dependabot-npm-force-overrides

Updates npm Dependabot PRs that only move transitive dependencies in `package-lock.json` so the PR also records the policy in `package.json` `overrides`.

This is for **npm only**.

You can see an example of the intended workflow [here](https://github.com/lreading/test-dependabot-npm-force-overrides/pull/1).

## Quickstart

```yaml
name: Dependabot npm overrides

on:
  pull_request_target:
    types: [opened, synchronize, reopened]

jobs:
  overrides:
    if: github.actor == 'dependabot[bot]'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          repository: ${{ github.event.pull_request.head.repo.full_name }}
          ref: ${{ github.event.pull_request.head.ref }}
          fetch-depth: 0

      - uses: lreading/dependabot-npm-force-overrides@8181327f59b1946543fec22578c527aeb322129e # v0.0.0
        with:
          github-token: ${{ github.token }}
```

_You can use a moving major tag like `@v1` after v1 exists, but a commit SHA is more secure._

## Configuration

| Input           | Required | Default               | Description                                                                                                           |
| --------------- | -------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `github-token`  | yes      | `${{ github.token }}` | Token used to push the override commit. Needs `contents: write`.                                                      |
| `package-roots` | no       | auto-detect           | Newline or comma separated npm package roots to inspect. If set, only these roots are checked. Example: `app1, app3`. |
| `dry-run`       | no       | `false`               | Report what would happen without writing, committing, or pushing.                                                     |
| `skip-label`    | no       | unset                 | PR label that makes the action exit without changes.                                                                  |

## Outputs

| Output      | Description                                              |
| ----------- | -------------------------------------------------------- |
| `changed`   | `true` when an override change was needed.               |
| `committed` | `true` when the action created a commit.                 |
| `pushed`    | `true` when the action pushed a commit to the PR branch. |

## Behavior

The action only changes transitive npm dependency updates. Direct dependency updates are left alone and exit successfully.

When it does change files, it runs npm with lifecycle scripts disabled:

```sh
npm install --package-lock-only --ignore-scripts
```

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

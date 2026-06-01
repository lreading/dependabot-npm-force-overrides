# dependabot-npm-force-overrides

Updates npm Dependabot PRs that only move transitive dependencies in `package-lock.json` so the PR also records the policy in `package.json` `overrides`.

This is for **npm only**.

Available on the [GitHub Marketplace](https://github.com/marketplace/actions/dependabot-npm-force-overrides).

You can see an example of the intended workflow [here](https://github.com/lreading/test-dependabot-npm-force-overrides/pull/1).

## Quickstart

```yaml
name: Dependabot npm overrides

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  overrides:
    if: >-
      github.actor == 'dependabot[bot]' &&
      github.event.pull_request.user.login == 'dependabot[bot]' &&
      github.repository == github.event.pull_request.head.repo.full_name
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@08eba0b27e820071cde6df949e0beb9ba4906955 # v4.3.0
        with:
          ref: ${{ github.event.pull_request.head.ref }}
          fetch-depth: 0
          persist-credentials: false

      - uses: lreading/dependabot-npm-force-overrides@a1c38a755edfdbaf02080e62069ba188773bd5bd # v1.0.1
        with:
          github-token: ${{ github.token }}
```

_You can use `@v1`, but pinning a commit SHA is more secure._

Do not run this action from `pull_request_target`. The action must check out and inspect the pull
request branch, and
[GitHub documents `pull_request_target`](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#pull_request_target)
plus untrusted pull request checkout as a privileged workflow pattern that can expose write tokens
or secrets. CodeQL reports the same issue as
[checkout of untrusted code in a privileged context](https://codeql.github.com/codeql-query-help/actions/actions-untrusted-checkout-critical/).

Use `pull_request` instead. Dependabot-triggered `pull_request` workflows receive a read-only
`GITHUB_TOKEN` by default, but
[GitHub's Dependabot Actions troubleshooting documentation](https://docs.github.com/en/code-security/dependabot/troubleshooting-dependabot/troubleshooting-dependabot-on-github-actions#changing-github_token-permissions)
says the workflow `permissions` key can increase the token scope for these runs. This action needs
`contents: write` so it can push the generated override commit back to the Dependabot branch. If your
repository or organization policy prevents that token from writing, run the action with
`dry-run: true` or provide a separate least-privilege GitHub App token.

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

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

### Signed Commits

By default, the generated override commit is unsigned. If a repository requires signed commits,
pass a private SSH signing key to the action and set `sign-commit: true`. This makes the action
configure SSH signing for the generated commit and call `git commit -S`, which
[GitHub documents for local signed commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits).
This action supports SSH signing for generated commits.

For Dependabot-triggered workflows, store signing secrets as Dependabot secrets, not Actions
secrets. GitHub documents that Dependabot-triggered workflows do not receive Actions secrets and
must use
[Dependabot secrets](https://docs.github.com/en/code-security/reference/supply-chain-security/troubleshoot-dependabot/dependabot-on-actions#accessing-secrets).

Recommended Dependabot secret name: `DEPENDABOT_OVERRIDES_SSH_SIGNING_KEY`.

1. Generate a dedicated SSH signing key.

   Store it outside the repository. Use a clear comment so the key is recognizable later.

   ```sh
   ssh-keygen -t ed25519 \
     -N '' \
     -C 'dependabot-npm-force-overrides signing key' \
     -f ~/.ssh/dependabot_npm_force_overrides_signing_ed25519
   ```

   The empty passphrase keeps signing non-interactive in GitHub Actions. Treat the private key as a
   sensitive secret and rotate it if it is exposed.

2. Upload the public key to the GitHub account that should verify the commits.

   With the GitHub CLI:

   ```sh
   gh ssh-key add ~/.ssh/dependabot_npm_force_overrides_signing_ed25519.pub \
     --type signing \
     --title 'dependabot-npm-force-overrides signing key'
   ```

   Or add the public key in GitHub settings as an SSH signing key. GitHub documents this in
   [Adding a new SSH key to your GitHub account](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/adding-a-new-ssh-key-to-your-github-account)
   and
   [Telling Git about your SSH signing key](https://docs.github.com/en/authentication/managing-commit-signature-verification/telling-git-about-your-signing-key#telling-git-about-your-ssh-key).

3. Add the private key as a repository Dependabot secret.

   You can do this in the GitHub UI from repository settings by adding a Dependabot secret named
   `DEPENDABOT_OVERRIDES_SSH_SIGNING_KEY`. The GitHub CLI is just a convenient way to do the same
   setup from a terminal:

   ```sh
   gh secret set DEPENDABOT_OVERRIDES_SSH_SIGNING_KEY \
     --app dependabot \
     --repo OWNER/REPO \
     < ~/.ssh/dependabot_npm_force_overrides_signing_ed25519
   ```

   Replace `OWNER/REPO` with the repository that runs this action. If you use a different secret
   name, pass that secret to `ssh-signing-key` in the workflow.

4. Pass the Dependabot secret to the action and enable signing.

   GitHub Actions does not expose Dependabot secrets to JavaScript actions by name, so the workflow
   must pass the secret value into the action input.

```yaml
- uses: lreading/dependabot-npm-force-overrides@a1c38a755edfdbaf02080e62069ba188773bd5bd # v1.0.1
  with:
    github-token: ${{ github.token }}
    sign-commit: true
    ssh-signing-key: ${{ secrets.DEPENDABOT_OVERRIDES_SSH_SIGNING_KEY }}
    commit-user-name: lreading
    commit-user-email: lreading@users.noreply.github.com
```

Use a committer identity associated with the GitHub account that owns the uploaded SSH signing key.
GitHub marks the generated commit as verified when the SSH signature validates against that uploaded
public key.

The action does not fail when `ssh-signing-key` is unset unless `sign-commit: true`.

## Configuration

| Input               | Required | Default                                                   | Description                                                                                                           |
| ------------------- | -------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `github-token`      | yes      | `${{ github.token }}`                                     | Token used to push the override commit. Needs `contents: write`.                                                      |
| `package-roots`     | no       | auto-detect                                               | Newline or comma separated npm package roots to inspect. If set, only these roots are checked. Example: `app1, app3`. |
| `dry-run`           | no       | `false`                                                   | Report what would happen without writing, committing, or pushing.                                                     |
| `skip-label`        | no       | unset                                                     | PR label that makes the action exit without changes.                                                                  |
| `commit-user-name`  | no       | `dependabot-npm-force-overrides`                          | Git `user.name` value for the generated override commit.                                                              |
| `commit-user-email` | no       | `dependabot-npm-force-overrides@users.noreply.github.com` | Git `user.email` value for the generated override commit.                                                             |
| `sign-commit`       | no       | `false`                                                   | Sign the generated override commit with `git commit -S`. Requires `ssh-signing-key`.                                  |
| `ssh-signing-key`   | no       | unset                                                     | Private SSH key used to sign the generated override commit when `sign-commit` is `true`.                              |

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

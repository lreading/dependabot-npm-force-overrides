Create a concise but explicit `AGENTS.md` for a new GitHub Action project.

The project is a GitHub Action for npm-only Dependabot PRs. Its purpose is to prevent dependency update PRs from relying only on `package-lock.json` changes when the dependency is transitive. The opinionated policy is:

> For npm projects, transitive dependency updates should be represented in `package.json` `overrides`, and the override should reflect the minimum acceptable/current resolved version. Lockfile-only updates are insufficient as durable dependency policy.

Important behavior:

- Scope this action to npm only.
- Do not support yarn, pnpm, bun, Ruby, Docker, GitHub Actions updates, Maven, Gradle, etc.
- Honor existing npm project configuration:
  - `package.json`
  - `package-lock.json`
  - `.npmrc`
  - `.node-version`
  - `.nvmrc`
  - `engines`
  - workspace/project layout where applicable
- Do not tightly couple the action to any one repository or directory layout.
- Users may configure package roots, but auto-detection should be the default where reasonable.
- Options should be optional or have sane defaults.
- Prefer conservative behavior and fail/no-op safely on ambiguity.

Core rule:

- If a Dependabot npm PR updates a transitive dependency in `package-lock.json`, the action should ensure the relevant npm project root has a matching `package.json` override.
- If there is no override, add one.
- If an override already exists but the lockfile now resolves to a newer acceptable version, update the override minimum to that resolved version.
  - Example: existing override is `"foo": ">=1.2.0"` and the lockfile now resolves `foo` to `1.2.4`; update the override to `"foo": ">=1.2.4"`.
- Do not leave overrides and lockfiles out of sync when the lockfile has moved forward.
- The default override style should be minimum-version policy: `>=x.y.z`.
- Direct dependencies should normally be updated in `dependencies` / `devDependencies`, not forced through overrides.
- npm direct-dependency override restrictions must be respected.
- this is not a replacement for dependabot - our job is not to manage dependencies, it's to change the shape of how dependabot manages them

The AGENTS.md should guide an AI coding agent. It should be direct, practical, and not huge.

Include sections for:

1. Project mission
2. Non-goals
3. Required official-source verification
4. Implementation language and tooling
5. Action behavior
6. Config/options philosophy
7. npm override rules
8. Lockfile handling
9. Safety/security requirements
10. Testing requirements
11. Lint/build requirements
12. Release/versioning process
13. PR checklist
14. Hallucination avoidance rules

Use TypeScript for the implementation.

Use GitHub Action tag-based releases with semantic versioning:
- `vMAJOR.MINOR.PATCH`
- moving major tags like `v1`
- no floating `latest` tag

Testing expectations:

- Unit tests for core decision logic.
- Fixture tests for real npm project layouts.
- Integration tests for running npm with `--package-lock-only`.
- Tests proving lifecycle scripts are not executed.
- Tests for direct dependency refusal.
- Tests for existing override sync behavior.
- Tests for nested npm project roots.
- Tests for scoped packages.
- Tests for unknown/ambiguous cases failing closed.

Security expectations:

- Never run untrusted lifecycle scripts.
- Use `npm install --package-lock-only --ignore-scripts`.
- Set `npm_config_ignore_scripts=true`.
- Do not execute repo-local scripts from the PR.
- Treat PR content as untrusted.
- Be very careful with `pull_request_target`.
- Verify the actor/author is Dependabot before mutating a PR branch.
- Use least-privilege GitHub token permissions.

Official docs/source references should be written as normal markdown links only.

The AGENTS.md should instruct future agents to check official docs before making claims or implementing behavior involving:

- GitHub Actions
- Dependabot
- npm overrides
- npm lockfiles
- GitHub API behavior
- Node.js runtime support

Use these official references in the AGENTS.md as markdown links:

- [GitHub Actions metadata syntax](https://docs.github.com/en/actions/sharing-automations/creating-actions/metadata-syntax-for-github-actions)
- [GitHub Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)
- [npm package.json documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)
- [npm package-lock.json documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json)
- [dependabot-core source](https://github.com/dependabot/dependabot-core)


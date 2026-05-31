# AGENTS.md - dependabot-npm-force-overrides

## 1. Project Mission

Build a TypeScript GitHub Action for npm-only Dependabot dependency PRs.

The action enforces this policy: for npm projects, transitive dependency updates should be represented in `package.json` `overrides`, and the override should reflect the minimum acceptable/current resolved version. Lockfile-only transitive updates are not durable dependency policy.

This action is not a replacement for Dependabot. Dependabot chooses dependency updates; this action changes the shape of npm transitive updates so policy lives in `package.json`, not only in `package-lock.json`.

## 2. Non-Goals

- Do not support Yarn, pnpm, Bun, Ruby, Docker, GitHub Actions updates, Maven, Gradle, or any non-npm ecosystem.
- Do not manage arbitrary dependency upgrades.
- Do not force direct dependencies through `overrides` when they should be represented in `dependencies`, `devDependencies`, `optionalDependencies`, or `peerDependencies`.
- Do not assume one repository layout, one package root, or one lockfile location.
- Do not add repository-specific behavior unless it is exposed as general configuration.

## 3. Required Official-Source Verification

Before making claims or implementing behavior involving GitHub Actions, Dependabot, npm overrides, npm lockfiles, GitHub API behavior, or Node.js runtime support, check official/current sources.

Use official docs or source first:

- [GitHub Actions metadata syntax](https://docs.github.com/en/actions/sharing-automations/creating-actions/metadata-syntax-for-github-actions)
- [GitHub Dependabot options reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference)
- [npm package.json documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)
- [npm package-lock.json documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json)
- [dependabot-core source](https://github.com/dependabot/dependabot-core)

If behavior is inferred from source or observed tests rather than documented, say so in comments, docs, and PR descriptions.

## 4. Implementation Language And Tooling

- Implement the action in TypeScript.
- Prefer small, testable core modules for lockfile parsing, project-root detection, override decisions, GitHub PR checks, and file mutation.
- Keep GitHub Action entrypoint code thin.
- Preserve JSON formatting where practical. Use structured JSON parsing/writing, not regex-based edits.
- Respect repo npm configuration: `package.json`, `package-lock.json`, `.npmrc`, `.node-version`, `.nvmrc`, `engines`, and npm workspace layout where applicable.

## 5. Action Behavior

- Run only for npm Dependabot PRs.
- Verify the PR actor/author is Dependabot before mutating a PR branch.
- Detect npm project roots by default where reasonable; allow users to configure roots explicitly.
- For each relevant npm project root, compare changed transitive dependencies in `package-lock.json` with `package.json` `overrides`.
- If a transitive dependency moved forward in the lockfile and has no matching override, add one.
- If an override exists but the resolved lockfile version is newer than the override minimum, update the override.
- Do not leave `package.json` overrides and `package-lock.json` resolved versions out of sync after mutation.
- On ambiguity, fail closed or no-op with a clear diagnostic.

## 6. Config/Options Philosophy

- Options should be optional or have sane defaults.
- Auto-detection should be the default when it can be done safely.
- Package roots may be configured explicitly.
- Avoid options that encode one repository's layout.
- Prefer conservative defaults over surprising mutation.
- Make dry-run/check-only behavior available if practical.

## 7. npm Override Rules

- Default override style is minimum-version policy: `>=x.y.z`.
- Example: if existing override is `"foo": ">=1.2.0"` and the lockfile now resolves `foo` to `1.2.4`, update it to `"foo": ">=1.2.4"`.
- Respect npm direct-dependency override restrictions.
- Direct dependencies should normally be updated in dependency fields, not forced through overrides.
- Refuse or fail closed when an override would violate npm semantics.
- Support scoped packages such as `@scope/name`.
- Preserve existing valid override structure when updating a targeted package.

## 8. Lockfile Handling

- Treat `package-lock.json` as the source for the currently resolved version.
- Use npm lockfile structure according to official npm docs and verified fixture behavior.
- Support nested npm project roots and npm workspace layouts where applicable.
- After modifying overrides, regenerate or validate the lockfile with:

```sh
npm install --package-lock-only --ignore-scripts
```

- Also set `npm_config_ignore_scripts=true` for npm subprocesses.
- Never update lockfiles by ad hoc text manipulation.

## 9. Safety/Security Requirements

- Treat PR content as untrusted.
- Never run untrusted lifecycle scripts.
- Do not execute repo-local scripts from the PR.
- Be very careful with `pull_request_target`; document required permissions and threat model before using it.
- Use least-privilege GitHub token permissions.
- Verify the actor/author is Dependabot before pushing commits or commenting with mutation intent.
- Avoid shell execution where a Node API is available. When shelling out to npm, pass arguments without shell interpolation.

## 10. Testing Requirements

Required coverage:

- Unit tests for core decision logic.
- Fixture tests for real npm project layouts.
- Integration tests that run npm with `--package-lock-only`.
- Tests proving lifecycle scripts are not executed.
- Tests for direct dependency refusal.
- Tests for existing override sync behavior.
- Tests for nested npm project roots.
- Tests for scoped packages.
- Tests for unknown or ambiguous cases failing closed.

Keep fixtures realistic and minimal. Include both mutation and no-op cases.

## 11. Lint/Build Requirements

Current commands:

- Install: `npm install`
- Test: `npm run test`
- Fixture/integration tests: `npm run test` until dedicated scripts exist
- Lint: `npm run lint`
- Format check: `npm run format:check`
- Typecheck: `npm run typecheck`
- Build/bundle: `npm run build`
- Full local gate: `npm run ci`

Before a PR is considered ready, run `npm run ci`.

## 12. Release/Versioning Process

Use GitHub Action tag-based releases with semantic versioning:

- Immutable release tags: `vMAJOR.MINOR.PATCH`
- Moving major tags: `v1`, `v2`, etc.
- No floating `latest` tag.

Update the moving major tag only after the patch/minor/major release tag is created and verified.

## 13. PR Checklist

- npm-only scope preserved.
- Official-source claims verified and linked when relevant.
- Dependabot author/actor checks are covered.
- Direct dependencies are not forced through overrides.
- Override minimums sync to current resolved lockfile versions.
- Lockfile regeneration uses `npm install --package-lock-only --ignore-scripts`.
- `npm_config_ignore_scripts=true` is set for npm subprocesses.
- Tests cover new behavior and safety cases.
- Lint, typecheck, tests, and build pass, or failures are explicitly documented.
- Docs and action metadata are updated when inputs, outputs, permissions, or runtime support change.

## 14. Hallucination Avoidance Rules

- Do not invent GitHub, Dependabot, npm, or Node behavior.
- Check official docs/source before implementing behavior that depends on external platform semantics.
- If docs and observed behavior differ, write a test and document the discrepancy.
- If a package-manager case is not npm, reject it or no-op clearly.
- If project-root detection is ambiguous, fail closed instead of guessing.
- If lockfile format handling is uncertain, add a fixture before changing production logic.

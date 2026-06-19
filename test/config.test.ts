import { describe, expect, it } from 'vitest';

import { parseActionConfig, type InputReader } from '../src/config.js';

describe('parseActionConfig', () => {
  it('uses defaults for omitted optional inputs', () => {
    const config = parseActionConfig(createInputReader({ 'github-token': 'token-value' }));

    expect(config).toEqual({
      githubToken: 'token-value',
      dryRun: false,
      packageRoots: [],
      commitUserName: 'dependabot-npm-force-overrides',
      commitUserEmail: 'dependabot-npm-force-overrides@users.noreply.github.com',
      signCommit: false,
      sshSigningKey: '',
    });
  });

  it('parses configured inputs', () => {
    const config = parseActionConfig(
      createInputReader({
        'github-token': 'token-value',
        'dry-run': 'true',
        'package-roots': '.\npackages/api, apps/web',
        'skip-label': 'skip-overrides',
        'commit-user-name': 'dependabot-overrides[bot]',
        'commit-user-email': 'dependabot-overrides[bot]@users.noreply.github.com',
        'sign-commit': 'true',
        'ssh-signing-key': 'private-key-value',
      }),
    );

    expect(config).toEqual({
      githubToken: 'token-value',
      dryRun: true,
      packageRoots: ['.', 'packages/api', 'apps/web'],
      skipLabel: 'skip-overrides',
      commitUserName: 'dependabot-overrides[bot]',
      commitUserEmail: 'dependabot-overrides[bot]@users.noreply.github.com',
      signCommit: true,
      sshSigningKey: 'private-key-value',
    });
  });
});

function createInputReader(values: Record<string, string> = {}): InputReader {
  return {
    getInput(name: string): string {
      return values[name] ?? '';
    },
    getBooleanInput(name: string): boolean {
      const value = values[name] ?? '';
      if (value === 'true') {
        return true;
      }

      if (value === 'false') {
        return false;
      }

      throw new Error(`Invalid boolean input for ${name}: ${value}`);
    },
  };
}

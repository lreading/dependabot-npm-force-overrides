import { describe, expect, it } from 'vitest';

import {
  createModePlan,
  parseActionConfig,
  type ActionMode,
  type InputReader,
} from '../src/config.js';

describe('parseActionConfig', () => {
  it('uses sane defaults for omitted inputs', () => {
    const config = parseActionConfig(createInputReader());

    expect(config).toEqual({
      githubToken: '',
      mode: 'check',
      dryRun: false,
      packageRoots: [],
      allowedBotLogins: ['dependabot[bot]'],
      overrideStrategy: 'minimum',
      securityOnly: false,
      failOnDirectLockfileOnly: true,
    });
  });

  it('parses configured inputs', () => {
    const config = parseActionConfig(
      createInputReader({
        'github-token': 'token-value',
        mode: 'comment',
        'dry-run': 'true',
        'package-roots': '.\npackages/api, apps/web',
        'allowed-bot-logins': 'dependabot[bot]\ncustom-bot[bot]',
        'override-strategy': 'minimum',
        'security-only': 'true',
        'fail-on-direct-lockfile-only': 'false',
        'skip-label': 'skip-overrides',
      }),
    );

    expect(config).toEqual({
      githubToken: 'token-value',
      mode: 'comment',
      dryRun: true,
      packageRoots: ['.', 'packages/api', 'apps/web'],
      allowedBotLogins: ['dependabot[bot]', 'custom-bot[bot]'],
      overrideStrategy: 'minimum',
      securityOnly: true,
      failOnDirectLockfileOnly: false,
      skipLabel: 'skip-overrides',
    });
  });

  it('rejects invalid modes', () => {
    expect(() => parseActionConfig(createInputReader({ mode: 'push' }))).toThrow(
      'Invalid mode "push"',
    );
  });

  it('rejects unsupported override strategies', () => {
    expect(() => parseActionConfig(createInputReader({ 'override-strategy': 'exact' }))).toThrow(
      'Invalid override-strategy "exact"',
    );
  });
});

describe('createModePlan', () => {
  it('plans check mode as non-mutating and failure-oriented', () => {
    expect(createModePlan(configForMode('check'))).toMatchObject({
      mode: 'check',
      dryRun: false,
      mayWriteFiles: false,
      mayComment: false,
      mayCommit: false,
      shouldFailOnChanges: true,
    });
  });

  it('plans comment mode as comment-only', () => {
    expect(createModePlan(configForMode('comment'))).toMatchObject({
      mode: 'comment',
      dryRun: false,
      mayWriteFiles: false,
      mayComment: true,
      mayCommit: false,
      shouldFailOnChanges: false,
    });
  });

  it('plans commit mode as file-writing and committing', () => {
    expect(createModePlan(configForMode('commit'))).toMatchObject({
      mode: 'commit',
      dryRun: false,
      mayWriteFiles: true,
      mayComment: false,
      mayCommit: true,
      shouldFailOnChanges: false,
    });
  });

  it('dry-run disables side effects for every mode', () => {
    for (const mode of ['check', 'comment', 'commit'] as const) {
      expect(createModePlan({ ...configForMode(mode), dryRun: true })).toMatchObject({
        mode,
        dryRun: true,
        mayWriteFiles: false,
        mayComment: false,
        mayCommit: false,
        shouldFailOnChanges: false,
      });
    }
  });
});

function configForMode(mode: ActionMode) {
  return parseActionConfig(createInputReader({ mode }));
}

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

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  expectedPackageFiles,
  runNpmPackageLockOnly,
  validateCommitMutationAllowed,
  type CommandRunner,
} from '../src/commit-mode.js';
import { createDefaultConfig } from '../src/config.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('validateCommitMutationAllowed', () => {
  it('allows configured Dependabot actors on Dependabot branches', () => {
    const result = validateCommitMutationAllowed(createDefaultConfig(), {
      actor: 'dependabot[bot]',
      author: 'dependabot[bot]',
      headRef: 'dependabot/npm_and_yarn/foo-1.2.3',
      labels: [],
    });

    expect(result.ok).toBe(true);
  });

  it('refuses untrusted actors before mutation', () => {
    const result = validateCommitMutationAllowed(createDefaultConfig(), {
      actor: 'octocat',
      author: 'dependabot[bot]',
      headRef: 'dependabot/npm_and_yarn/foo-1.2.3',
      labels: [],
    });

    expect(result.ok).toBe(false);
  });

  it('refuses non-Dependabot branches', () => {
    const result = validateCommitMutationAllowed(createDefaultConfig(), {
      actor: 'dependabot[bot]',
      author: 'dependabot[bot]',
      headRef: 'feature/foo',
      labels: [],
    });

    expect(result.ok).toBe(false);
  });

  it('honors skip labels as a closed no-op', () => {
    const result = validateCommitMutationAllowed(
      { ...createDefaultConfig(), skipLabel: 'skip-overrides' },
      {
        actor: 'dependabot[bot]',
        author: 'dependabot[bot]',
        headRef: 'dependabot/npm_and_yarn/foo-1.2.3',
        labels: ['skip-overrides'],
      },
    );

    expect(result.ok).toBe(false);
  });
});

describe('expectedPackageFiles', () => {
  it('limits commit mode to package files for selected roots', () => {
    expect(expectedPackageFiles(['.', 'packages/api'])).toEqual([
      'package.json',
      'package-lock.json',
      'packages/api/package.json',
      'packages/api/package-lock.json',
    ]);
  });
});

describe('runNpmPackageLockOnly', () => {
  it('passes the safe npm lockfile-only command and script suppression environment', async () => {
    const calls: { command: string; args: readonly string[]; env?: NodeJS.ProcessEnv }[] = [];
    const runner: CommandRunner = {
      execFile(command, args, options) {
        calls.push({
          command,
          args,
          ...(options.env === undefined ? {} : { env: options.env }),
        });
        return Promise.resolve({ stdout: '', stderr: '' });
      },
    };

    await runNpmPackageLockOnly('/tmp/project', runner);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      command: 'npm',
      args: ['install', '--package-lock-only', '--ignore-scripts'],
    });
    expect(calls[0]?.env?.npm_config_ignore_scripts).toBe('true');
  });

  it('does not execute lifecycle scripts during a real npm lockfile refresh', async () => {
    const project = await createTempDirectory();
    const marker = path.join(project, 'script-ran');
    await writeFile(
      path.join(project, 'package.json'),
      JSON.stringify(
        {
          name: 'lifecycle-security-fixture',
          version: '1.0.0',
          scripts: {
            preinstall: `node -e "require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')"`,
            install: `node -e "require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')"`,
            postinstall: `node -e "require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')"`,
          },
        },
        null,
        2,
      ),
      'utf8',
    );

    await runNpmPackageLockOnly(project);

    await expect(readFile(marker, 'utf8')).rejects.toThrow();
  });
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'dnfo-'));
  tempDirectories.push(directory);
  return directory;
}

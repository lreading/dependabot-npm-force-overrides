import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createNpmLockfileEnv,
  executeCommitMode,
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

  it('does not pass the GitHub push token to npm subprocesses', () => {
    const env = createNpmLockfileEnv({
      GITHUB_TOKEN: 'github-token',
      GH_TOKEN: 'gh-token',
      'INPUT_GITHUB-TOKEN': 'input-token',
      INPUT_GITHUB_TOKEN: 'normalized-input-token',
      NODE_AUTH_TOKEN: 'registry-token',
      PATH: '/usr/bin',
    });

    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.GH_TOKEN).toBeUndefined();
    expect(env['INPUT_GITHUB-TOKEN']).toBeUndefined();
    expect(env.INPUT_GITHUB_TOKEN).toBeUndefined();
    expect(env.NODE_AUTH_TOKEN).toBe('registry-token');
    expect(env.PATH).toBe('/usr/bin');
    expect(env.npm_config_ignore_scripts).toBe('true');
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

describe('executeCommitMode', () => {
  it('commits an override for the Dependabot transitive update happy path', async () => {
    const project = await createTempDirectory();
    const eventPath = path.join(project, 'event.json');
    const commands: string[] = [];
    let packageJsonChanged = false;
    let lockfileRefreshed = false;

    await writeFile(
      eventPath,
      JSON.stringify({
        pull_request: {
          user: { login: 'dependabot[bot]' },
          head: {
            ref: 'dependabot/npm_and_yarn/semver-7.8.1',
            repo: {
              full_name: 'lreading/test-dependabot-npm-force-overrides',
            },
          },
          labels: [],
        },
      }),
      'utf8',
    );
    await writeFile(
      path.join(project, 'package.json'),
      JSON.stringify(
        {
          name: 'fixture',
          version: '1.0.0',
          dependencies: {
            'npm-package-arg': '12.0.2',
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    await writeFile(path.join(project, 'package-lock.json'), lockfile('7.8.1'), 'utf8');

    const runner: CommandRunner = {
      execFile(command, args) {
        commands.push([command, ...args].join(' '));

        if (command === 'npm') {
          lockfileRefreshed = true;
          return Promise.resolve({ stdout: '', stderr: '' });
        }

        if (command !== 'git') {
          throw new Error(`Unexpected command: ${command}`);
        }

        if (args.join(' ') === 'status --porcelain') {
          return Promise.resolve({ stdout: '', stderr: '' });
        }

        if (args.join(' ') === 'rev-parse HEAD^') {
          return Promise.resolve({ stdout: 'base\n', stderr: '' });
        }

        if (args.join(' ') === 'diff --name-only base..HEAD') {
          return Promise.resolve({ stdout: 'package-lock.json\n', stderr: '' });
        }

        if (args.join(' ') === 'show base:package-lock.json') {
          return Promise.resolve({ stdout: lockfile('7.5.1'), stderr: '' });
        }

        if (args.join(' ') === 'diff --name-only') {
          packageJsonChanged = true;
          return Promise.resolve({ stdout: 'package.json\n', stderr: '' });
        }

        if (args.join(' ') === 'diff --cached --name-only') {
          return Promise.resolve({
            stdout: packageJsonChanged ? 'package.json\n' : '',
            stderr: '',
          });
        }

        if (
          args[0] === 'add' ||
          args.includes('commit') ||
          args[0] === 'remote' ||
          args[0] === 'push'
        ) {
          return Promise.resolve({ stdout: '', stderr: '' });
        }

        throw new Error(`Unexpected git args: ${args.join(' ')}`);
      },
    };

    const result = await executeCommitMode({
      config: { ...createDefaultConfig(), githubToken: 'token-value' },
      cwd: project,
      env: {
        GITHUB_ACTOR: 'dependabot[bot]',
        GITHUB_EVENT_PATH: eventPath,
      },
      runner,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        changed: true,
        committed: true,
        pushed: true,
        packageRoots: ['.'],
      });
    }
    await expect(readFile(path.join(project, 'package.json'), 'utf8')).resolves.toContain(
      '"semver": ">=7.8.1"',
    );
    expect(lockfileRefreshed).toBe(true);
    expect(commands).toContain('git add package.json package-lock.json');
    expect(commands).toContain(
      'git -c user.name=dependabot-npm-force-overrides -c user.email=dependabot-npm-force-overrides@users.noreply.github.com commit -m Apply npm overrides for Dependabot transitive updates',
    );
    expect(commands).toContain(
      'git remote set-url origin https://x-access-token:token-value@github.com/lreading/test-dependabot-npm-force-overrides.git',
    );
    expect(commands).toContain('git push origin HEAD:dependabot/npm_and_yarn/semver-7.8.1');
  });

  it('uses configured signed commit options', async () => {
    const project = await createTempDirectory();
    const eventPath = path.join(project, 'event.json');

    await writeFile(
      eventPath,
      JSON.stringify({
        pull_request: {
          user: { login: 'dependabot[bot]' },
          head: { ref: 'dependabot/npm_and_yarn/semver-7.8.1' },
          labels: [],
        },
      }),
      'utf8',
    );
    await writeFile(
      path.join(project, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '1.0.0' }, null, 2),
      'utf8',
    );
    await writeFile(path.join(project, 'package-lock.json'), lockfile('7.8.1'), 'utf8');

    const runner = createRootRunner(lockfile('7.5.1'));
    const result = await executeCommitMode({
      config: {
        ...createDefaultConfig(),
        commitUserName: 'dependabot-overrides[bot]',
        commitUserEmail: 'dependabot-overrides[bot]@users.noreply.github.com',
        signCommit: true,
      },
      cwd: project,
      env: {
        GITHUB_ACTOR: 'dependabot[bot]',
        GITHUB_EVENT_PATH: eventPath,
      },
      runner,
    });

    expect(result.ok).toBe(true);
    expect(runner.commands).toContain(
      'git -c user.name=dependabot-overrides[bot] -c user.email=dependabot-overrides[bot]@users.noreply.github.com commit -S -m Apply npm overrides for Dependabot transitive updates',
    );
  });

  it('handles a nested package root without touching root package files', async () => {
    const project = await createTempDirectory();
    const packageRoot = path.join(project, 'packages/app');
    const eventPath = path.join(project, 'event.json');

    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      eventPath,
      JSON.stringify({
        pull_request: {
          user: { login: 'dependabot[bot]' },
          head: { ref: 'dependabot/npm_and_yarn/packages/app/semver-7.8.1' },
          labels: [],
        },
      }),
      'utf8',
    );
    await writeFile(
      path.join(packageRoot, 'package.json'),
      JSON.stringify({ name: 'nested-fixture', version: '1.0.0' }, null, 2),
      'utf8',
    );
    await writeFile(path.join(packageRoot, 'package-lock.json'), lockfile('7.8.1'), 'utf8');

    const runner = createNestedRunner(lockfile('7.5.1'));
    const result = await executeCommitMode({
      config: { ...createDefaultConfig(), packageRoots: ['packages/app'] },
      cwd: project,
      env: {
        GITHUB_ACTOR: 'dependabot[bot]',
        GITHUB_EVENT_PATH: eventPath,
      },
      runner,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packageRoots).toEqual(['packages/app']);
      expect(result.value.committed).toBe(true);
      expect(result.value.pushed).toBe(true);
    }
    await expect(readFile(path.join(packageRoot, 'package.json'), 'utf8')).resolves.toContain(
      '"semver": ">=7.8.1"',
    );
    expect(runner.commands).toContain(
      'git add packages/app/package.json packages/app/package-lock.json',
    );
  });
});

async function createTempDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'dnfo-'));
  tempDirectories.push(directory);
  return directory;
}

function createRootRunner(beforeLockfile: string): CommandRunner & { readonly commands: string[] } {
  const commands: string[] = [];
  let packageJsonChanged = false;

  return {
    commands,
    execFile(command, args) {
      commands.push([command, ...args].join(' '));

      if (command === 'npm') {
        return Promise.resolve({ stdout: '', stderr: '' });
      }

      if (command !== 'git') {
        throw new Error(`Unexpected command: ${command}`);
      }

      if (args.join(' ') === 'status --porcelain') {
        return Promise.resolve({ stdout: '', stderr: '' });
      }

      if (args.join(' ') === 'rev-parse HEAD^') {
        return Promise.resolve({ stdout: 'base\n', stderr: '' });
      }

      if (args.join(' ') === 'diff --name-only base..HEAD') {
        return Promise.resolve({ stdout: 'package-lock.json\n', stderr: '' });
      }

      if (args.join(' ') === 'show base:package-lock.json') {
        return Promise.resolve({ stdout: beforeLockfile, stderr: '' });
      }

      if (args.join(' ') === 'diff --name-only') {
        packageJsonChanged = true;
        return Promise.resolve({ stdout: 'package.json\n', stderr: '' });
      }

      if (args.join(' ') === 'diff --cached --name-only') {
        return Promise.resolve({
          stdout: packageJsonChanged ? 'package.json\n' : '',
          stderr: '',
        });
      }

      if (args[0] === 'add' || args.includes('commit') || args[0] === 'push') {
        return Promise.resolve({ stdout: '', stderr: '' });
      }

      throw new Error(`Unexpected git args: ${args.join(' ')}`);
    },
  };
}

function createNestedRunner(
  beforeLockfile: string,
): CommandRunner & { readonly commands: string[] } {
  const commands: string[] = [];
  let packageJsonChanged = false;

  return {
    commands,
    execFile(command, args) {
      commands.push([command, ...args].join(' '));

      if (command === 'npm') {
        return Promise.resolve({ stdout: '', stderr: '' });
      }

      if (command !== 'git') {
        throw new Error(`Unexpected command: ${command}`);
      }

      if (args.join(' ') === 'status --porcelain') {
        return Promise.resolve({ stdout: '', stderr: '' });
      }

      if (args.join(' ') === 'rev-parse HEAD^') {
        return Promise.resolve({ stdout: 'base\n', stderr: '' });
      }

      if (args.join(' ') === 'diff --name-only base..HEAD') {
        return Promise.resolve({ stdout: 'packages/app/package-lock.json\n', stderr: '' });
      }

      if (args.join(' ') === 'show base:packages/app/package-lock.json') {
        return Promise.resolve({ stdout: beforeLockfile, stderr: '' });
      }

      if (args.join(' ') === 'diff --name-only') {
        packageJsonChanged = true;
        return Promise.resolve({ stdout: 'packages/app/package.json\n', stderr: '' });
      }

      if (args.join(' ') === 'diff --cached --name-only') {
        return Promise.resolve({
          stdout: packageJsonChanged ? 'packages/app/package.json\n' : '',
          stderr: '',
        });
      }

      if (args[0] === 'add' || args.includes('commit') || args[0] === 'push') {
        return Promise.resolve({ stdout: '', stderr: '' });
      }

      throw new Error(`Unexpected git args: ${args.join(' ')}`);
    },
  };
}

function lockfile(semverVersion: string): string {
  return JSON.stringify(
    {
      name: 'fixture',
      version: '1.0.0',
      lockfileVersion: 3,
      packages: {
        '': {
          name: 'fixture',
          version: '1.0.0',
        },
        'node_modules/semver': {
          version: semverVersion,
        },
      },
    },
    null,
    2,
  );
}

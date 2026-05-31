import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import * as posixPath from 'node:path/posix';
import { promisify } from 'node:util';

import type { ActionConfig } from './config.js';
import { analyzeLockfileOverrideSync } from './lockfile.js';
import {
  detectPackageRootsFromChangedLockfiles,
  readPackageJson,
  type Result,
} from './npm-project.js';

const execFileAsync = promisify(execFile);

export type CommandResult = {
  readonly stdout: string;
  readonly stderr: string;
};

export type CommandRunner = {
  readonly execFile: (
    command: string,
    args: readonly string[],
    options: CommandOptions,
  ) => Promise<CommandResult>;
};

export type CommandOptions = {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
};

export type CommitModeOptions = {
  readonly config: ActionConfig;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly runner?: CommandRunner;
  readonly logger?: {
    readonly info: (message: string) => void;
  };
};

export type CommitModeOutcome = {
  readonly changed: boolean;
  readonly committed: boolean;
  readonly packageRoots: readonly string[];
  readonly message: string;
};

export type PullRequestContext = {
  readonly actor: string;
  readonly author: string;
  readonly headRef: string;
  readonly labels: readonly string[];
};

type PullRequestEvent = {
  readonly pull_request?: {
    readonly user?: {
      readonly login?: string;
    };
    readonly head?: {
      readonly ref?: string;
    };
    readonly labels?: readonly {
      readonly name?: string;
    }[];
  };
};

export async function executeCommitMode(
  options: CommitModeOptions,
): Promise<Result<CommitModeOutcome>> {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const runner = options.runner ?? defaultCommandRunner;
  const logger = options.logger ?? { info: () => undefined };
  const context = await readPullRequestContext(env);
  if (!context.ok) {
    return context;
  }

  const allowed = validateCommitMutationAllowed(options.config, context.value);
  if (!allowed.ok) {
    return allowed;
  }

  const clean = await requireCleanWorkingTree(runner, cwd);
  if (!clean.ok) {
    return clean;
  }

  const base = await resolveBaseCommit(runner, cwd, env);
  if (!base.ok) {
    return base;
  }

  const changedPaths = await git(runner, cwd, ['diff', '--name-only', `${base.value}..HEAD`]);
  let packageRoots: readonly string[];
  if (options.config.packageRoots.length > 0) {
    packageRoots = options.config.packageRoots;
  } else {
    const detectedPackageRoots = detectPackageRootsFromChangedLockfiles(
      splitLines(changedPaths.stdout),
    );
    if (!detectedPackageRoots.ok) {
      return detectedPackageRoots;
    }
    packageRoots = detectedPackageRoots.value;
  }

  const expectedFiles = expectedPackageFiles(packageRoots);
  const rootsToRefresh: string[] = [];

  for (const packageRoot of packageRoots) {
    const packageJson = readPackageJson(packageRoot, cwd);
    if (!packageJson.ok) {
      return packageJson;
    }

    const lockfilePath = joinRepoPath(packageRoot, 'package-lock.json');
    const beforeLockfile = await git(runner, cwd, ['show', `${base.value}:${lockfilePath}`]);
    const afterLockfile = await readFile(path.join(cwd, lockfilePath), 'utf8');
    const analysis = analyzeLockfileOverrideSync(
      packageJson.value,
      beforeLockfile.stdout,
      afterLockfile,
    );
    if (!analysis.ok) {
      return analysis;
    }

    const directLockfileOnly = analysis.value.decisions.some(
      (decision) => decision.directDependencyField !== undefined,
    );
    if (directLockfileOnly && options.config.failOnDirectLockfileOnly) {
      return fail('Direct dependency lockfile-only updates are not eligible for overrides.');
    }

    if (!analysis.value.changed) {
      continue;
    }

    await writeFile(
      path.join(cwd, joinRepoPath(packageRoot, 'package.json')),
      `${JSON.stringify(analysis.value.packageJson, null, 2)}\n`,
      'utf8',
    );
    rootsToRefresh.push(packageRoot);
  }

  if (rootsToRefresh.length === 0) {
    return {
      ok: true,
      value: {
        changed: false,
        committed: false,
        packageRoots,
        message: 'No override changes were needed.',
      },
    };
  }

  for (const packageRoot of rootsToRefresh) {
    logger.info(`Refreshing npm lockfile in ${packageRoot}`);
    await runNpmPackageLockOnly(path.join(cwd, packageRoot === '.' ? '' : packageRoot), runner);
  }

  const expected = new Set(expectedFiles);
  const actualChangedFiles = await getWorkingTreeChangedFiles(runner, cwd);
  const unexpected = actualChangedFiles.filter((changedFile) => !expected.has(changedFile));
  if (unexpected.length > 0) {
    return fail(`Unexpected files changed during commit mode: ${unexpected.join(', ')}`);
  }

  await git(runner, cwd, ['add', ...expectedFiles]);
  const staged = await git(runner, cwd, ['diff', '--cached', '--name-only']);
  if (splitLines(staged.stdout).length === 0) {
    return {
      ok: true,
      value: {
        changed: false,
        committed: false,
        packageRoots,
        message: 'No staged changes remained after lockfile refresh.',
      },
    };
  }

  await git(runner, cwd, [
    '-c',
    'user.name=dependabot-npm-force-overrides',
    '-c',
    'user.email=dependabot-npm-force-overrides@users.noreply.github.com',
    'commit',
    '-m',
    'Apply npm overrides for Dependabot transitive updates',
  ]);

  return {
    ok: true,
    value: {
      changed: true,
      committed: true,
      packageRoots,
      message: 'Committed npm override updates.',
    },
  };
}

export async function runNpmPackageLockOnly(
  packageRootPath: string,
  runner: CommandRunner = defaultCommandRunner,
): Promise<CommandResult> {
  return runner.execFile('npm', ['install', '--package-lock-only', '--ignore-scripts'], {
    cwd: packageRootPath,
    env: {
      ...process.env,
      npm_config_ignore_scripts: 'true',
    },
  });
}

export function validateCommitMutationAllowed(
  config: ActionConfig,
  context: PullRequestContext,
): Result<PullRequestContext> {
  if (config.skipLabel !== undefined && context.labels.includes(config.skipLabel)) {
    return fail(`PR has skip label "${config.skipLabel}".`);
  }

  if (!config.allowedBotLogins.includes(context.actor)) {
    return fail(`Actor ${context.actor} is not allowed to mutate PR branches.`);
  }

  if (!config.allowedBotLogins.includes(context.author)) {
    return fail(`PR author ${context.author} is not allowed for mutation.`);
  }

  if (!context.headRef.startsWith('dependabot/')) {
    return fail(`PR branch ${context.headRef} is not a Dependabot branch.`);
  }

  return {
    ok: true,
    value: context,
  };
}

export function expectedPackageFiles(packageRoots: readonly string[]): readonly string[] {
  return packageRoots.flatMap((packageRoot) => [
    joinRepoPath(packageRoot, 'package.json'),
    joinRepoPath(packageRoot, 'package-lock.json'),
  ]);
}

async function readPullRequestContext(env: NodeJS.ProcessEnv): Promise<Result<PullRequestContext>> {
  const eventPath = env.GITHUB_EVENT_PATH;
  if (eventPath === undefined || eventPath.trim() === '') {
    return fail('GITHUB_EVENT_PATH is required for commit mode.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(eventPath, 'utf8'));
  } catch {
    return fail('GITHUB_EVENT_PATH does not contain valid JSON.');
  }

  if (!isPullRequestEvent(parsed)) {
    return fail('Commit mode requires a pull_request event payload.');
  }

  const actor = env.GITHUB_ACTOR;
  if (actor === undefined || actor.trim() === '') {
    return fail('GITHUB_ACTOR is required for commit mode.');
  }

  const author = parsed.pull_request.user?.login;
  const headRef = parsed.pull_request.head?.ref;
  if (author === undefined || headRef === undefined) {
    return fail('Pull request event payload is missing author or head ref.');
  }

  return {
    ok: true,
    value: {
      actor,
      author,
      headRef,
      labels:
        parsed.pull_request.labels
          ?.map((label) => label.name)
          .filter((labelName): labelName is string => labelName !== undefined) ?? [],
    },
  };
}

async function requireCleanWorkingTree(
  runner: CommandRunner,
  cwd: string,
): Promise<Result<undefined>> {
  const status = await git(runner, cwd, ['status', '--porcelain']);
  if (status.stdout.trim() !== '') {
    return fail('Working tree must be clean before commit mode runs.');
  }

  return {
    ok: true,
    value: undefined,
  };
}

async function resolveBaseCommit(
  runner: CommandRunner,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<Result<string>> {
  const baseRef = env.GITHUB_BASE_REF;
  if (baseRef !== undefined && baseRef.trim() !== '') {
    const originBase = await tryGit(runner, cwd, ['merge-base', 'HEAD', `origin/${baseRef}`]);
    if (originBase.ok) {
      return originBase;
    }

    const localBase = await tryGit(runner, cwd, ['merge-base', 'HEAD', baseRef]);
    if (localBase.ok) {
      return localBase;
    }
  }

  return tryGit(runner, cwd, ['rev-parse', 'HEAD^']);
}

async function getWorkingTreeChangedFiles(
  runner: CommandRunner,
  cwd: string,
): Promise<readonly string[]> {
  const unstaged = await git(runner, cwd, ['diff', '--name-only']);
  const staged = await git(runner, cwd, ['diff', '--cached', '--name-only']);
  return [...new Set([...splitLines(unstaged.stdout), ...splitLines(staged.stdout)])].sort();
}

async function git(
  runner: CommandRunner,
  cwd: string,
  args: readonly string[],
): Promise<CommandResult> {
  return runner.execFile('git', args, { cwd });
}

async function tryGit(
  runner: CommandRunner,
  cwd: string,
  args: readonly string[],
): Promise<Result<string>> {
  try {
    const result = await git(runner, cwd, args);
    return {
      ok: true,
      value: result.stdout.trim(),
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}

const defaultCommandRunner: CommandRunner = {
  async execFile(command: string, args: readonly string[], options: CommandOptions) {
    const result = await execFileAsync(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      shell: false,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
};

function joinRepoPath(packageRoot: string, filename: string): string {
  return packageRoot === '.' ? filename : posixPath.join(packageRoot, filename);
}

function splitLines(value: string): readonly string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function isPullRequestEvent(value: unknown): value is PullRequestEvent & {
  readonly pull_request: NonNullable<PullRequestEvent['pull_request']>;
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'pull_request' in value &&
    typeof value.pull_request === 'object' &&
    value.pull_request !== null
  );
}

function fail(reason: string): Result<never> {
  return {
    ok: false,
    reason,
  };
}

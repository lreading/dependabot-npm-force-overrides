export type ActionConfig = {
  readonly githubToken: string;
  readonly mode: ActionMode;
  readonly dryRun: boolean;
  readonly packageRoots: readonly string[];
  readonly allowedBotLogins: readonly string[];
  readonly overrideStrategy: OverrideStrategy;
  readonly securityOnly: boolean;
  readonly failOnDirectLockfileOnly: boolean;
  readonly skipLabel?: string;
};

export type ActionMode = 'check' | 'comment' | 'commit';

export type OverrideStrategy = 'minimum';

export type InputReader = {
  readonly getInput: (name: string) => string;
  readonly getBooleanInput: (name: string) => boolean;
};

export type ModePlan = {
  readonly mode: ActionMode;
  readonly dryRun: boolean;
  readonly mayWriteFiles: boolean;
  readonly mayComment: boolean;
  readonly mayCommit: boolean;
  readonly shouldFailOnChanges: boolean;
  readonly summary: string;
};

export function createDefaultConfig(): ActionConfig {
  return {
    githubToken: '',
    mode: 'check',
    dryRun: false,
    packageRoots: [],
    allowedBotLogins: ['dependabot[bot]'],
    overrideStrategy: 'minimum',
    securityOnly: false,
    failOnDirectLockfileOnly: true,
  };
}

export function parseActionConfig(inputs: InputReader): ActionConfig {
  const defaults = createDefaultConfig();
  const githubTokenInput = readOptionalInput(inputs, 'github-token');
  const allowedBotLogins = parseListInput(readOptionalInput(inputs, 'allowed-bot-logins'));
  const mode = parseMode(withDefault(readOptionalInput(inputs, 'mode'), defaults.mode));
  const overrideStrategy = parseOverrideStrategy(
    withDefault(readOptionalInput(inputs, 'override-strategy'), defaults.overrideStrategy),
  );
  const skipLabel = readOptionalInput(inputs, 'skip-label');

  return {
    githubToken: withDefault(githubTokenInput, process.env.GITHUB_TOKEN ?? ''),
    mode,
    dryRun: readBooleanInput(inputs, 'dry-run', defaults.dryRun),
    packageRoots: parseListInput(readOptionalInput(inputs, 'package-roots')) ?? [],
    allowedBotLogins: allowedBotLogins ?? defaults.allowedBotLogins,
    overrideStrategy,
    securityOnly: readBooleanInput(inputs, 'security-only', defaults.securityOnly),
    failOnDirectLockfileOnly: readBooleanInput(
      inputs,
      'fail-on-direct-lockfile-only',
      defaults.failOnDirectLockfileOnly,
    ),
    ...(skipLabel === '' ? {} : { skipLabel }),
  };
}

export function createModePlan(config: ActionConfig): ModePlan {
  if (config.dryRun) {
    return {
      mode: config.mode,
      dryRun: true,
      mayWriteFiles: false,
      mayComment: false,
      mayCommit: false,
      shouldFailOnChanges: false,
      summary: `dry-run ${config.mode} mode: report only`,
    };
  }

  if (config.mode === 'check') {
    return {
      mode: config.mode,
      dryRun: false,
      mayWriteFiles: false,
      mayComment: false,
      mayCommit: false,
      shouldFailOnChanges: true,
      summary: 'check mode: report required changes and fail when changes are needed',
    };
  }

  if (config.mode === 'comment') {
    return {
      mode: config.mode,
      dryRun: false,
      mayWriteFiles: false,
      mayComment: true,
      mayCommit: false,
      shouldFailOnChanges: false,
      summary: 'comment mode: report required changes as a PR comment',
    };
  }

  return {
    mode: config.mode,
    dryRun: false,
    mayWriteFiles: true,
    mayComment: false,
    mayCommit: true,
    shouldFailOnChanges: false,
    summary: 'commit mode: write fixes and commit them to the PR branch',
  };
}

function readOptionalInput(inputs: InputReader, name: string): string {
  return inputs.getInput(name).trim();
}

function readBooleanInput(inputs: InputReader, name: string, defaultValue: boolean): boolean {
  const rawValue = readOptionalInput(inputs, name);
  if (rawValue === '') {
    return defaultValue;
  }

  return inputs.getBooleanInput(name);
}

function parseMode(value: string): ActionMode {
  if (value === 'check' || value === 'comment' || value === 'commit') {
    return value;
  }

  throw new Error(`Invalid mode "${value}". Expected one of: check, comment, commit.`);
}

function parseOverrideStrategy(value: string): OverrideStrategy {
  if (value === 'minimum') {
    return value;
  }

  throw new Error(`Invalid override-strategy "${value}". Only "minimum" is supported.`);
}

function parseListInput(value: string): readonly string[] | undefined {
  if (value.trim() === '') {
    return undefined;
  }

  const entries = value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  return entries.length === 0 ? undefined : entries;
}

function withDefault<T extends string>(value: string, defaultValue: T): string | T {
  return value === '' ? defaultValue : value;
}

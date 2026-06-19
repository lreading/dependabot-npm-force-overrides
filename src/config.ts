export type ActionConfig = {
  readonly githubToken: string;
  readonly dryRun: boolean;
  readonly packageRoots: readonly string[];
  readonly skipLabel?: string;
  readonly commitUserName: string;
  readonly commitUserEmail: string;
  readonly signCommit: boolean;
  readonly sshSigningKey: string;
};

export type InputReader = {
  readonly getInput: (name: string) => string;
  readonly getBooleanInput: (name: string) => boolean;
};

export function createDefaultConfig(): ActionConfig {
  return {
    githubToken: '',
    dryRun: false,
    packageRoots: [],
    commitUserName: 'dependabot-npm-force-overrides',
    commitUserEmail: 'dependabot-npm-force-overrides@users.noreply.github.com',
    signCommit: false,
    sshSigningKey: '',
  };
}

export function parseActionConfig(inputs: InputReader): ActionConfig {
  const defaults = createDefaultConfig();
  const githubTokenInput = readOptionalInput(inputs, 'github-token');
  const githubToken = githubTokenInput === '' ? (process.env.GITHUB_TOKEN ?? '') : githubTokenInput;
  const skipLabel = readOptionalInput(inputs, 'skip-label');
  const commitUserName = readOptionalInput(inputs, 'commit-user-name');
  const commitUserEmail = readOptionalInput(inputs, 'commit-user-email');

  return {
    githubToken,
    dryRun: readBooleanInput(inputs, 'dry-run', defaults.dryRun),
    packageRoots: parseListInput(readOptionalInput(inputs, 'package-roots')) ?? [],
    ...(skipLabel === '' ? {} : { skipLabel }),
    commitUserName: commitUserName === '' ? defaults.commitUserName : commitUserName,
    commitUserEmail: commitUserEmail === '' ? defaults.commitUserEmail : commitUserEmail,
    signCommit: readBooleanInput(inputs, 'sign-commit', defaults.signCommit),
    sshSigningKey: readOptionalInput(inputs, 'ssh-signing-key'),
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

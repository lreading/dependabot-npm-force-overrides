import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as posixPath from 'node:path/posix';

export type DependencyField =
  | 'dependencies'
  | 'devDependencies'
  | 'optionalDependencies'
  | 'peerDependencies';

export type PackageJson = {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
  readonly optionalDependencies?: Record<string, string>;
  readonly peerDependencies?: Record<string, string>;
  overrides?: unknown;
  readonly [key: string]: unknown;
};

export type NpmProjectRoot = {
  readonly path: string;
};

export type Result<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

export function createNpmProjectRoot(path: string): NpmProjectRoot {
  return { path };
}

export function detectPackageRootsFromChangedLockfiles(
  changedPaths: readonly string[],
): Result<string[]> {
  if (changedPaths.length === 0) {
    return fail('No changed paths were provided.');
  }

  const roots = new Set<string>();

  for (const changedPath of changedPaths) {
    const normalized = normalizeRepoRelativePath(changedPath);
    if (!normalized.ok) {
      return normalized;
    }

    if (posixPath.basename(normalized.value) !== 'package-lock.json') {
      continue;
    }

    const root = posixPath.dirname(normalized.value);
    roots.add(root === '.' ? '.' : root);
  }

  if (roots.size === 0) {
    return fail('No changed package-lock.json files were provided.');
  }

  return {
    ok: true,
    value: [...roots].sort(),
  };
}

export function parsePackageJson(content: string): Result<PackageJson> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return fail('package.json is not valid JSON.');
  }

  if (!isRecord(parsed) || Array.isArray(parsed)) {
    return fail('package.json must contain a JSON object.');
  }

  for (const field of dependencyFields) {
    const dependencies = parsed[field];
    if (dependencies !== undefined && !isStringRecord(dependencies)) {
      return fail(`package.json ${field} must be an object of string specs.`);
    }
  }

  return {
    ok: true,
    value: parsed,
  };
}

export function readPackageJson(
  packageRoot: string,
  baseDirectory = process.cwd(),
): Result<PackageJson> {
  const normalized = normalizeRepoRelativePath(packageRoot);
  if (!normalized.ok) {
    return normalized;
  }

  const packageJsonPath = path.join(baseDirectory, normalized.value, 'package.json');

  try {
    return parsePackageJson(readFileSync(packageJsonPath, 'utf8'));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(`Unable to read package.json at ${packageJsonPath}: ${message}`);
  }
}

export function isDirectDependency(packageJson: PackageJson, packageName: string): boolean {
  return getDirectDependencyField(packageJson, packageName) !== undefined;
}

export function getDirectDependencyField(
  packageJson: PackageJson,
  packageName: string,
): DependencyField | undefined {
  for (const field of dependencyFields) {
    const dependencies = packageJson[field];
    if (dependencies !== undefined && Object.hasOwn(dependencies, packageName)) {
      return field;
    }
  }

  return undefined;
}

const dependencyFields: readonly DependencyField[] = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

function normalizeRepoRelativePath(inputPath: string): Result<string> {
  if (inputPath.trim() === '') {
    return fail('Path must not be empty.');
  }

  if (path.isAbsolute(inputPath) || inputPath.includes('\\')) {
    return fail(`Path must be a POSIX repo-relative path: ${inputPath}`);
  }

  const normalized = posixPath.normalize(inputPath);
  if (normalized === '..' || normalized.startsWith('../')) {
    return fail(`Path must not escape the repository: ${inputPath}`);
  }

  return {
    ok: true,
    value: normalized,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!isRecord(value) || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === 'string');
}

function fail(reason: string): Result<never> {
  return {
    ok: false,
    reason,
  };
}

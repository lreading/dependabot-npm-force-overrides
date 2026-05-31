import { gt, valid } from 'semver';

import { getDirectDependencyField, type PackageJson, type Result } from './npm-project.js';

export type OverrideChange = {
  readonly packageName: string;
  readonly versionRange: string;
};

export type TransitiveDependencyDecision =
  | {
      readonly eligible: true;
    }
  | {
      readonly eligible: false;
      readonly reason: string;
    };

export type OverrideSyncResult = {
  readonly changed: boolean;
  readonly packageJson: PackageJson;
  readonly reason: string;
};

export function createOverrideChange(packageName: string, versionRange: string): OverrideChange {
  return {
    packageName,
    versionRange,
  };
}

export function decideTransitiveDependencyEligibility(
  packageJson: PackageJson,
  packageName: string,
): TransitiveDependencyDecision {
  const directDependencyField = getDirectDependencyField(packageJson, packageName);
  if (directDependencyField !== undefined) {
    return {
      eligible: false,
      reason: `${packageName} is a direct dependency in ${directDependencyField}.`,
    };
  }

  return {
    eligible: true,
  };
}

export function syncMinimumVersionOverride(
  packageJson: PackageJson,
  packageName: string,
  resolvedVersion: string,
): Result<OverrideSyncResult> {
  const validatedPackage = validatePackageName(packageName);
  if (!validatedPackage.ok) {
    return validatedPackage;
  }

  if (valid(resolvedVersion) === null) {
    return fail(`Resolved version must be an exact semver version: ${resolvedVersion}`);
  }

  const eligibility = decideTransitiveDependencyEligibility(packageJson, packageName);
  if (!eligibility.eligible) {
    return fail(eligibility.reason);
  }

  const overrides = packageJson.overrides;
  if (overrides === undefined) {
    return changedWith({
      ...packageJson,
      overrides: {
        [packageName]: minimumRange(resolvedVersion),
      },
    });
  }

  if (!isPlainObject(overrides)) {
    return fail('package.json overrides must be an object.');
  }

  const currentOverride = overrides[packageName];
  if (currentOverride === undefined) {
    return changedWith({
      ...packageJson,
      overrides: {
        ...overrides,
        [packageName]: minimumRange(resolvedVersion),
      },
    });
  }

  if (typeof currentOverride === 'string') {
    const synced = syncOverrideRange(currentOverride, resolvedVersion);
    if (!synced.ok) {
      return synced;
    }

    if (!synced.value.changed) {
      return unchanged(packageJson);
    }

    return changedWith({
      ...packageJson,
      overrides: {
        ...overrides,
        [packageName]: synced.value.versionRange,
      },
    });
  }

  if (isPlainObject(currentOverride)) {
    const selfOverride = currentOverride['.'];
    if (selfOverride === undefined) {
      return changedWith({
        ...packageJson,
        overrides: {
          ...overrides,
          [packageName]: {
            ...currentOverride,
            '.': minimumRange(resolvedVersion),
          },
        },
      });
    }

    if (typeof selfOverride !== 'string') {
      return fail(`Override for ${packageName} "." must be a string.`);
    }

    const synced = syncOverrideRange(selfOverride, resolvedVersion);
    if (!synced.ok) {
      return synced;
    }

    if (!synced.value.changed) {
      return unchanged(packageJson);
    }

    return changedWith({
      ...packageJson,
      overrides: {
        ...overrides,
        [packageName]: {
          ...currentOverride,
          '.': synced.value.versionRange,
        },
      },
    });
  }

  return fail(`Override for ${packageName} must be a string or object.`);
}

function syncOverrideRange(
  currentRange: string,
  resolvedVersion: string,
): Result<{ readonly changed: boolean; readonly versionRange: string }> {
  const currentMinimum = parseMinimumVersionRange(currentRange);
  if (!currentMinimum.ok) {
    return currentMinimum;
  }

  if (!gt(resolvedVersion, currentMinimum.value)) {
    return {
      ok: true,
      value: {
        changed: false,
        versionRange: currentRange,
      },
    };
  }

  return {
    ok: true,
    value: {
      changed: true,
      versionRange: minimumRange(resolvedVersion),
    },
  };
}

function parseMinimumVersionRange(versionRange: string): Result<string> {
  const match = /^>=\s*(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(
    versionRange,
  );

  if (match === null) {
    return fail(`Only minimum-version override ranges like ">=1.2.3" can be synced.`);
  }

  const version = match[1];
  if (version === undefined || valid(version) === null) {
    return fail(`Override minimum is not a valid semver version: ${versionRange}`);
  }

  return {
    ok: true,
    value: version,
  };
}

function minimumRange(version: string): string {
  return `>=${version}`;
}

function validatePackageName(packageName: string): Result<string> {
  if (packageName.trim() === '') {
    return fail('Package name must not be empty.');
  }

  if (packageName.includes('/') && !/^@[a-z0-9._-]+\/[a-z0-9._-]+$/i.test(packageName)) {
    return fail(`Invalid scoped package name: ${packageName}`);
  }

  if (!packageName.includes('/') && !/^[a-z0-9._-]+$/i.test(packageName)) {
    return fail(`Invalid package name: ${packageName}`);
  }

  return {
    ok: true,
    value: packageName,
  };
}

function changedWith(packageJson: PackageJson): Result<OverrideSyncResult> {
  return {
    ok: true,
    value: {
      changed: true,
      packageJson,
      reason: 'override synced',
    },
  };
}

function unchanged(packageJson: PackageJson): Result<OverrideSyncResult> {
  return {
    ok: true,
    value: {
      changed: false,
      packageJson,
      reason: 'override already current',
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fail(reason: string): Result<never> {
  return {
    ok: false,
    reason,
  };
}

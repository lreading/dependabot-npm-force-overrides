import { syncMinimumVersionOverride } from './overrides.js';
import { getDirectDependencyField, type PackageJson, type Result } from './npm-project.js';

export type LockfileDependency = {
  readonly name: string;
  readonly version: string;
};

export type LockfileDependencyUpdate = {
  readonly name: string;
  readonly resolvedVersion: string;
};

export type ChangedLockfilePackage = {
  readonly name: string;
  readonly previousVersion: string;
  readonly resolvedVersion: string;
  readonly locations: readonly string[];
};

export type LockfileOverrideDecision = {
  readonly name: string;
  readonly previousVersion: string;
  readonly resolvedVersion: string;
  readonly directDependencyField?: string;
  readonly overrideChanged: boolean;
  readonly reason: string;
};

export type LockfileOverrideAnalysis = {
  readonly changed: boolean;
  readonly packageJson: PackageJson;
  readonly decisions: readonly LockfileOverrideDecision[];
};

export type PackageRootLockfileInput = {
  readonly packageRoot: string;
  readonly packageJson: PackageJson;
  readonly beforeLockfileContent: string;
  readonly afterLockfileContent: string;
};

export type PackageRootLockfileAnalysis = LockfileOverrideAnalysis & {
  readonly packageRoot: string;
};

export function createLockfileDependency(name: string, version: string): LockfileDependency {
  return {
    name,
    version,
  };
}

export function createLockfileDependencyUpdate(
  name: string,
  resolvedVersion: string,
): LockfileDependencyUpdate {
  return {
    name,
    resolvedVersion,
  };
}

export function detectChangedLockfilePackages(
  beforeLockfileContent: string,
  afterLockfileContent: string,
): Result<ChangedLockfilePackage[]> {
  const before = parsePackageLock(beforeLockfileContent);
  if (!before.ok) {
    return before;
  }

  const after = parsePackageLock(afterLockfileContent);
  if (!after.ok) {
    return after;
  }

  const changedByName = new Map<string, MutableChangedPackage>();

  for (const [location, afterPackage] of after.value.packages) {
    const packageName = packageNameFromLockfileLocation(location);
    if (packageName === undefined) {
      continue;
    }

    const beforePackage = before.value.packages.get(location);
    if (beforePackage?.version === afterPackage.version) {
      continue;
    }

    const previousVersion = beforePackage?.version ?? '';
    const existing = changedByName.get(packageName);

    if (existing === undefined) {
      changedByName.set(packageName, {
        name: packageName,
        previousVersion,
        resolvedVersion: afterPackage.version,
        locations: [location],
      });
      continue;
    }

    if (
      existing.previousVersion !== previousVersion ||
      existing.resolvedVersion !== afterPackage.version
    ) {
      return fail(
        `Ambiguous lockfile update for ${packageName}: multiple version changes were found.`,
      );
    }

    existing.locations.push(location);
  }

  return {
    ok: true,
    value: [...changedByName.values()].map((change) => ({
      ...change,
      locations: [...change.locations].sort(),
    })),
  };
}

export function analyzeLockfileOverrideSync(
  packageJson: PackageJson,
  beforeLockfileContent: string,
  afterLockfileContent: string,
): Result<LockfileOverrideAnalysis> {
  const changedPackages = detectChangedLockfilePackages(
    beforeLockfileContent,
    afterLockfileContent,
  );
  if (!changedPackages.ok) {
    return changedPackages;
  }

  let nextPackageJson = packageJson;
  const decisions: LockfileOverrideDecision[] = [];

  for (const changedPackage of changedPackages.value) {
    const directDependencyField = getDirectDependencyField(nextPackageJson, changedPackage.name);
    if (directDependencyField !== undefined) {
      decisions.push({
        name: changedPackage.name,
        previousVersion: changedPackage.previousVersion,
        resolvedVersion: changedPackage.resolvedVersion,
        directDependencyField,
        overrideChanged: false,
        reason: `${changedPackage.name} is a direct dependency in ${directDependencyField}.`,
      });
      continue;
    }

    const synced = syncMinimumVersionOverride(
      nextPackageJson,
      changedPackage.name,
      changedPackage.resolvedVersion,
    );
    if (!synced.ok) {
      return synced;
    }

    nextPackageJson = synced.value.packageJson;
    decisions.push({
      name: changedPackage.name,
      previousVersion: changedPackage.previousVersion,
      resolvedVersion: changedPackage.resolvedVersion,
      overrideChanged: synced.value.changed,
      reason: synced.value.reason,
    });
  }

  return {
    ok: true,
    value: {
      changed: decisions.some((decision) => decision.overrideChanged),
      packageJson: nextPackageJson,
      decisions,
    },
  };
}

export function analyzePackageRootLockfileOverrideSync(
  inputs: readonly PackageRootLockfileInput[],
): Result<PackageRootLockfileAnalysis[]> {
  const analyses: PackageRootLockfileAnalysis[] = [];

  for (const input of inputs) {
    const analysis = analyzeLockfileOverrideSync(
      input.packageJson,
      input.beforeLockfileContent,
      input.afterLockfileContent,
    );
    if (!analysis.ok) {
      return analysis;
    }

    analyses.push({
      ...analysis.value,
      packageRoot: input.packageRoot,
    });
  }

  return {
    ok: true,
    value: analyses,
  };
}

type ParsedLockfilePackage = {
  readonly version: string;
};

type ParsedLockfile = {
  readonly lockfileVersion: 2 | 3;
  readonly packages: ReadonlyMap<string, ParsedLockfilePackage>;
};

type MutableChangedPackage = {
  readonly name: string;
  readonly previousVersion: string;
  readonly resolvedVersion: string;
  readonly locations: string[];
};

function parsePackageLock(content: string): Result<ParsedLockfile> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    return fail('package-lock.json is not valid JSON.');
  }

  if (!isPlainObject(parsed)) {
    return fail('package-lock.json must contain a JSON object.');
  }

  if (parsed.lockfileVersion !== 2 && parsed.lockfileVersion !== 3) {
    return fail(`Unsupported package-lock.json lockfileVersion: ${String(parsed.lockfileVersion)}`);
  }

  if (!isPlainObject(parsed.packages)) {
    return fail('package-lock.json packages must be an object.');
  }

  const packages = new Map<string, ParsedLockfilePackage>();
  for (const [location, descriptor] of Object.entries(parsed.packages)) {
    if (!isPlainObject(descriptor)) {
      return fail(`Package descriptor for ${location} must be an object.`);
    }

    if (location === '') {
      continue;
    }

    if (descriptor.link === true) {
      continue;
    }

    if (descriptor.version === undefined) {
      continue;
    }

    if (typeof descriptor.version !== 'string') {
      return fail(`Package descriptor for ${location} has a non-string version.`);
    }

    packages.set(location, {
      version: descriptor.version,
    });
  }

  return {
    ok: true,
    value: {
      lockfileVersion: parsed.lockfileVersion,
      packages,
    },
  };
}

function packageNameFromLockfileLocation(location: string): string | undefined {
  const segments = location.split('/');
  const nodeModulesIndex = segments.lastIndexOf('node_modules');
  if (nodeModulesIndex === -1) {
    return undefined;
  }

  const firstNamePart = segments[nodeModulesIndex + 1];
  if (firstNamePart === undefined || firstNamePart === '') {
    return undefined;
  }

  if (firstNamePart.startsWith('@')) {
    const scopedName = segments[nodeModulesIndex + 2];
    if (scopedName === undefined || scopedName === '') {
      return undefined;
    }

    return `${firstNamePart}/${scopedName}`;
  }

  return firstNamePart;
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

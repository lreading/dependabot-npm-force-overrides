import { describe, expect, it } from 'vitest';

import {
  analyzeLockfileOverrideSync,
  analyzePackageRootLockfileOverrideSync,
  detectChangedLockfilePackages,
} from '../src/lockfile.js';
import type { PackageJson } from '../src/npm-project.js';

describe('detectChangedLockfilePackages', () => {
  it('detects a transitive package version bump', () => {
    const result = detectChangedLockfilePackages(
      lockfile({
        'node_modules/foo': { version: '1.0.0' },
      }),
      lockfile({
        'node_modules/foo': { version: '1.0.1' },
      }),
    );

    expect(result).toEqual({
      ok: true,
      value: [
        {
          name: 'foo',
          previousVersion: '1.0.0',
          resolvedVersion: '1.0.1',
          locations: ['node_modules/foo'],
        },
      ],
    });
  });

  it('supports scoped packages', () => {
    const result = detectChangedLockfilePackages(
      lockfile({
        'node_modules/@scope/foo': { version: '2.0.0' },
      }),
      lockfile({
        'node_modules/@scope/foo': { version: '2.0.1' },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.name).toBe('@scope/foo');
      expect(result.value[0]?.resolvedVersion).toBe('2.0.1');
    }
  });

  it('fails closed for unsupported lockfile versions', () => {
    const result = detectChangedLockfilePackages(lockfile({}, 1), lockfile({}, 1));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('Unsupported');
    }
  });

  it('fails closed when one package has ambiguous changed resolved versions', () => {
    const result = detectChangedLockfilePackages(
      lockfile({
        'node_modules/foo': { version: '1.0.0' },
        'node_modules/parent/node_modules/foo': { version: '1.0.0' },
      }),
      lockfile({
        'node_modules/foo': { version: '1.0.1' },
        'node_modules/parent/node_modules/foo': { version: '1.0.2' },
      }),
    );

    expect(result.ok).toBe(false);
  });
});

describe('analyzeLockfileOverrideSync', () => {
  it('adds an override for a transitive package version bump', () => {
    const result = analyzeLockfileOverrideSync(
      {},
      lockfile({
        'node_modules/foo': { version: '1.0.0' },
      }),
      lockfile({
        'node_modules/foo': { version: '1.0.1' },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.changed).toBe(true);
      expect(result.value.packageJson.overrides).toEqual({
        foo: '>=1.0.1',
      });
      expect(result.value.decisions).toEqual([
        {
          name: 'foo',
          previousVersion: '1.0.0',
          resolvedVersion: '1.0.1',
          overrideChanged: true,
          reason: 'override synced',
        },
      ]);
    }
  });

  it('does not add an override for a direct dependency version bump', () => {
    const packageJson: PackageJson = {
      dependencies: {
        foo: '^1.0.0',
      },
    };

    const result = analyzeLockfileOverrideSync(
      packageJson,
      lockfile({
        'node_modules/foo': { version: '1.0.0' },
      }),
      lockfile({
        'node_modules/foo': { version: '1.0.1' },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.changed).toBe(false);
      expect(result.value.packageJson).toBe(packageJson);
      expect(result.value.decisions).toEqual([
        {
          name: 'foo',
          previousVersion: '1.0.0',
          resolvedVersion: '1.0.1',
          directDependencyField: 'dependencies',
          overrideChanged: false,
          reason: 'foo is a direct dependency in dependencies.',
        },
      ]);
    }
  });

  it('syncs an existing override minimum from the resolved lockfile version', () => {
    const result = analyzeLockfileOverrideSync(
      {
        overrides: {
          foo: '>=1.0.0',
        },
      },
      lockfile({
        'node_modules/foo': { version: '1.0.0' },
      }),
      lockfile({
        'node_modules/foo': { version: '1.0.1' },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packageJson.overrides).toEqual({
        foo: '>=1.0.1',
      });
    }
  });

  it('no-ops for a lockfile refresh where the override already matches', () => {
    const packageJson: PackageJson = {
      overrides: {
        foo: '>=1.0.1',
      },
    };

    const result = analyzeLockfileOverrideSync(
      packageJson,
      lockfile({
        'node_modules/foo': { version: '1.0.0' },
      }),
      lockfile({
        'node_modules/foo': { version: '1.0.1' },
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.changed).toBe(false);
      expect(result.value.packageJson).toBe(packageJson);
    }
  });
});

describe('analyzePackageRootLockfileOverrideSync', () => {
  it('analyzes multiple package roots independently', () => {
    const result = analyzePackageRootLockfileOverrideSync([
      {
        packageRoot: '.',
        packageJson: {},
        beforeLockfileContent: lockfile({
          'node_modules/foo': { version: '1.0.0' },
        }),
        afterLockfileContent: lockfile({
          'node_modules/foo': { version: '1.0.1' },
        }),
      },
      {
        packageRoot: 'packages/api',
        packageJson: {},
        beforeLockfileContent: lockfile({
          'node_modules/bar': { version: '2.0.0' },
        }),
        afterLockfileContent: lockfile({
          'node_modules/bar': { version: '2.0.1' },
        }),
      },
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.packageRoot).toBe('.');
      expect(result.value[0]?.packageJson.overrides).toEqual({
        foo: '>=1.0.1',
      });
      expect(result.value[1]?.packageRoot).toBe('packages/api');
      expect(result.value[1]?.packageJson.overrides).toEqual({
        bar: '>=2.0.1',
      });
    }
  });
});

type MinimalLockfilePackage = {
  readonly version?: string;
  readonly link?: boolean;
};

function lockfile(
  packages: Record<string, MinimalLockfilePackage>,
  lockfileVersion: 2 | 3 | 1 = 3,
): string {
  return JSON.stringify({
    name: 'fixture',
    version: '1.0.0',
    lockfileVersion,
    packages: {
      '': {
        name: 'fixture',
        version: '1.0.0',
      },
      ...packages,
    },
  });
}

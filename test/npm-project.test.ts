import { describe, expect, it } from 'vitest';

import {
  detectPackageRootsFromChangedLockfiles,
  isDirectDependency,
  parsePackageJson,
  type PackageJson,
} from '../src/npm-project.js';

describe('detectPackageRootsFromChangedLockfiles', () => {
  it('detects the root package from a changed root lockfile', () => {
    expect(detectPackageRootsFromChangedLockfiles(['package-lock.json'])).toEqual({
      ok: true,
      value: ['.'],
    });
  });

  it('detects nested package roots from changed lockfiles', () => {
    expect(
      detectPackageRootsFromChangedLockfiles([
        'docs/README.md',
        'packages/api/package-lock.json',
        'apps/web/package-lock.json',
      ]),
    ).toEqual({
      ok: true,
      value: ['apps/web', 'packages/api'],
    });
  });

  it('fails closed when no package-lock.json changed path is present', () => {
    const result = detectPackageRootsFromChangedLockfiles(['package.json']);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('No changed package-lock.json');
    }
  });

  it('fails closed for ambiguous repository-escaping paths', () => {
    const result = detectPackageRootsFromChangedLockfiles(['../package-lock.json']);

    expect(result.ok).toBe(false);
  });
});

describe('parsePackageJson', () => {
  it('parses package.json objects', () => {
    expect(parsePackageJson('{"dependencies":{"left-pad":"^1.0.0"}}')).toEqual({
      ok: true,
      value: {
        dependencies: {
          'left-pad': '^1.0.0',
        },
      },
    });
  });

  it('fails closed for invalid package.json dependency fields', () => {
    const result = parsePackageJson('{"dependencies":["left-pad"]}');

    expect(result.ok).toBe(false);
  });
});

describe('isDirectDependency', () => {
  it('detects direct dependencies across npm dependency fields', () => {
    const packageJson: PackageJson = {
      devDependencies: {
        vitest: '^3.0.0',
      },
    };

    expect(isDirectDependency(packageJson, 'vitest')).toBe(true);
    expect(isDirectDependency(packageJson, 'semver')).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';

import {
  decideTransitiveDependencyEligibility,
  syncMinimumVersionOverride,
} from '../src/overrides.js';
import type { PackageJson } from '../src/npm-project.js';

describe('decideTransitiveDependencyEligibility', () => {
  it('refuses direct dependencies', () => {
    const result = decideTransitiveDependencyEligibility(
      {
        dependencies: {
          foo: '^1.0.0',
        },
      },
      'foo',
    );

    expect(result).toEqual({
      eligible: false,
      reason: 'foo is a direct dependency in dependencies.',
    });
  });

  it('allows packages that are not direct dependencies', () => {
    expect(decideTransitiveDependencyEligibility({}, 'foo')).toEqual({
      eligible: true,
    });
  });
});

describe('syncMinimumVersionOverride', () => {
  it('adds a missing override for a transitive dependency', () => {
    const result = syncMinimumVersionOverride({}, 'foo', '1.2.4');

    expect(result).toEqual({
      ok: true,
      value: {
        changed: true,
        packageJson: {
          overrides: {
            foo: '>=1.2.4',
          },
        },
        reason: 'override synced',
      },
    });
  });

  it('supports scoped packages', () => {
    const result = syncMinimumVersionOverride({}, '@scope/foo', '2.0.1');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packageJson.overrides).toEqual({
        '@scope/foo': '>=2.0.1',
      });
    }
  });

  it('updates an existing override minimum when the lockfile resolved version moved forward', () => {
    const packageJson: PackageJson = {
      overrides: {
        foo: '>=1.2.0',
      },
    };

    const result = syncMinimumVersionOverride(packageJson, 'foo', '1.2.4');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.changed).toBe(true);
      expect(result.value.packageJson.overrides).toEqual({
        foo: '>=1.2.4',
      });
    }
  });

  it('no-ops when an existing override minimum is already current', () => {
    const packageJson: PackageJson = {
      overrides: {
        foo: '>=1.2.4',
      },
    };

    const result = syncMinimumVersionOverride(packageJson, 'foo', '1.2.4');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.changed).toBe(false);
      expect(result.value.packageJson).toBe(packageJson);
    }
  });

  it('no-ops when an existing override minimum is newer than the resolved version', () => {
    const packageJson: PackageJson = {
      overrides: {
        foo: '>=1.3.0',
      },
    };

    const result = syncMinimumVersionOverride(packageJson, 'foo', '1.2.4');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.changed).toBe(false);
    }
  });

  it('updates an existing object-form override minimum', () => {
    const packageJson: PackageJson = {
      overrides: {
        foo: {
          '.': '>=1.2.0',
          bar: '>=3.0.0',
        },
      },
    };

    const result = syncMinimumVersionOverride(packageJson, 'foo', '1.2.4');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packageJson.overrides).toEqual({
        foo: {
          '.': '>=1.2.4',
          bar: '>=3.0.0',
        },
      });
    }
  });

  it('does not modify unrelated override entries while adding the requested package', () => {
    const packageJson: PackageJson = {
      overrides: {
        bar: '>=3.0.0',
      },
    };

    const result = syncMinimumVersionOverride(packageJson, 'foo', '1.2.4');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.packageJson.overrides).toEqual({
        bar: '>=3.0.0',
        foo: '>=1.2.4',
      });
    }
  });

  it('refuses direct dependencies instead of writing overrides', () => {
    const result = syncMinimumVersionOverride(
      {
        dependencies: {
          foo: '^1.0.0',
        },
      },
      'foo',
      '1.2.4',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('direct dependency');
    }
  });

  it('fails closed for invalid resolved versions', () => {
    const result = syncMinimumVersionOverride({}, 'foo', 'latest');

    expect(result.ok).toBe(false);
  });

  it('fails closed for ambiguous existing override styles', () => {
    const result = syncMinimumVersionOverride(
      {
        overrides: {
          foo: '^1.0.0',
        },
      },
      'foo',
      '1.2.4',
    );

    expect(result.ok).toBe(false);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isAuthoritativePrelaunchConfig,
  resolveServerAppVersion,
} from './appVersion.ts';

describe('resolveServerAppVersion', () => {
  it('accepts bounded SemVer and normalizes surrounding whitespace', () => {
    assert.deepEqual(resolveServerAppVersion(' 1.5.0 '), {
      kind: 'version',
      value: '1.5.0',
    });
    assert.equal(resolveServerAppVersion('1.5.0-rc.1+build.7').kind, 'version');
  });

  it('distinguishes missing configuration and rejects malformed or ambiguous versions', () => {
    assert.deepEqual(resolveServerAppVersion(undefined), { kind: 'missing' });
    assert.deepEqual(resolveServerAppVersion(''), { kind: 'missing' });
    for (const value of ['1', 'v1.5.0', '01.5.0', '1.5.0-01', '1.5.0.1']) {
      assert.deepEqual(resolveServerAppVersion(value), { kind: 'invalid' }, value);
    }
  });
});

describe('isAuthoritativePrelaunchConfig', () => {
  it('allows only a disabled or not-yet-launched authoritative gate', () => {
    const now = Date.parse('2026-08-02T00:00:00Z');
    assert.equal(isAuthoritativePrelaunchConfig({ enabled: false, launch_at: null }, now), true);
    assert.equal(
      isAuthoritativePrelaunchConfig(
        { enabled: true, launch_at: '2026-08-03T00:00:00Z' },
        now,
      ),
      true,
    );
    assert.equal(isAuthoritativePrelaunchConfig({ enabled: true, launch_at: null }, now), false);
    assert.equal(
      isAuthoritativePrelaunchConfig(
        { enabled: true, launch_at: '2026-08-01T00:00:00Z' },
        now,
      ),
      false,
    );
    assert.equal(isAuthoritativePrelaunchConfig(null, now), false);
  });
});

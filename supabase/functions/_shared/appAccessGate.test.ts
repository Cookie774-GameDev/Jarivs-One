import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateAppAccessGate } from './appAccessGate.ts';

describe('evaluateAppAccessGate', () => {
  it('allows every exact migration-0032 usable tuple', () => {
    const tuples = [
      { status: 'prelaunch', enabled: false, canUseApp: true },
      { status: 'trialing', enabled: true, canUseApp: true },
      { status: 'active', enabled: true, canUseApp: true },
      { status: 'cancel_at_period_end', enabled: true, canUseApp: true },
      { status: 'past_due', enabled: true, canUseApp: true },
      { status: 'grace', enabled: true, canUseApp: true },
      { status: 'admin', enabled: false, canUseApp: true },
      { status: 'admin', enabled: true, canUseApp: true },
      { status: 'internal', enabled: false, canUseApp: true },
      { status: 'internal', enabled: true, canUseApp: true },
    ];

    for (const tuple of tuples) {
      assert.deepEqual(evaluateAppAccessGate(tuple), {
        kind: 'allow',
        status: tuple.status,
      });
    }
  });

  it('returns a recognized denial for exact locked and unknown decisions', () => {
    for (const tuple of [
      { status: 'locked', enabled: true, canUseApp: false },
      { status: 'unknown', enabled: true, canUseApp: false },
      { status: 'unknown', enabled: false, canUseApp: false },
    ]) {
      assert.deepEqual(evaluateAppAccessGate(tuple), {
        kind: 'deny',
        status: tuple.status,
      });
    }
  });

  it('fails closed on disabled production states and all status/boolean contradictions', () => {
    const contradictions = [
      { status: 'prelaunch', enabled: true, canUseApp: true },
      { status: 'prelaunch', enabled: false, canUseApp: false },
      { status: 'active', enabled: false, canUseApp: true },
      { status: 'trialing', enabled: true, canUseApp: false },
      { status: 'locked', enabled: true, canUseApp: true },
      { status: 'locked', enabled: false, canUseApp: false },
      { status: 'unknown', enabled: true, canUseApp: true },
      { status: 'admin', enabled: true, canUseApp: false },
      { status: 'internal', enabled: false, canUseApp: false },
    ];

    for (const tuple of contradictions) {
      assert.deepEqual(evaluateAppAccessGate(tuple), {
        kind: 'invalid',
        status: tuple.status,
      });
    }
  });

  it('fails closed on malformed, nonboolean, and unrecognized decisions', () => {
    const malformed = [
      null,
      [],
      'active',
      {},
      { status: 'active', enabled: true },
      { status: 'active', canUseApp: true },
      { enabled: true, canUseApp: true },
      { status: 1, enabled: true, canUseApp: true },
      { status: 'active', enabled: 'true', canUseApp: true },
      { status: 'active', enabled: true, canUseApp: 1 },
      { status: 'future_status', enabled: true, canUseApp: true },
    ];

    for (const value of malformed) {
      assert.deepEqual(evaluateAppAccessGate(value), { kind: 'invalid' });
    }
  });
});

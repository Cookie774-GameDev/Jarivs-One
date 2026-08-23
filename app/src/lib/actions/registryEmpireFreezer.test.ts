import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '@/stores/ui';
import {
  getEmpireFreezerConfig,
  resetEmpireFreezerForTests,
} from '@/features/wellness/empireFreezer';
import { getBuiltinAction } from './registry';
import { buildAddendumText } from './promptAddendum';

describe('Empire Freezer built-in tool', () => {
  beforeEach(() => {
    resetEmpireFreezerForTests();
    useUIStore.setState({
      wellnessActive: false,
      wellnessKind: null,
      wellnessStartedAt: null,
      wellnessDurationMs: null,
    });
  });

  it('is registered and enables a bounded local 20-20-20 cadence', async () => {
    const action = getBuiltinAction('wellness.empireFreezer');
    expect(action).toBeDefined();

    await expect(
      action!.run({ mode: 'enable', intervalMin: 20, durationSec: 20 }, { source: 'user' }),
    ).resolves.toMatchObject({ ok: true });
    expect(getEmpireFreezerConfig()).toEqual({
      enabled: true,
      intervalMs: 1_200_000,
      durationMs: 20_000,
    });
    expect(buildAddendumText()).toContain('wellness.empireFreezer');
    expect(buildAddendumText()).not.toContain('wellness.eyeBreak');
  });

  it('can pause the cadence or start the existing break immediately', async () => {
    const action = getBuiltinAction('wellness.empireFreezer')!;
    await action.run({ mode: 'enable' }, { source: 'user' });
    await action.run({ mode: 'pause' }, { source: 'user' });
    expect(getEmpireFreezerConfig().enabled).toBe(false);

    await action.run({ mode: 'run_now', durationSec: 25 }, { source: 'user' });
    expect(useUIStore.getState()).toMatchObject({
      wellnessActive: true,
      wellnessKind: 'eye-break-20-20-20',
      wellnessDurationMs: 25_000,
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  clearSiyuanSummaryRoutePreference,
  matchesSiyuanSummaryRoutePreference,
  readSiyuanSummaryRoutePreference,
  writeAutomaticSiyuanSummaryRoutePreference,
  writeSiyuanSummaryRoutePreference,
} from './siyuanSummaryRoutePreference';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

describe('SiYuan summary route preference', () => {
  it('persists the exact provider, connection, and model per map without credentials', () => {
    const storage = memoryStorage();
    expect(
      writeSiyuanSummaryRoutePreference(storage, 'account', 'project', 'map-a', {
        providerId: 'opencode',
        connectionId: 'opencode-cli',
        modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
        effort: 'high',
      }),
    ).toBe(true);
    expect(readSiyuanSummaryRoutePreference(storage, 'account', 'project', 'map-a')).toEqual({
      mode: 'route',
      providerId: 'opencode',
      connectionId: 'opencode-cli',
      modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
      effort: 'high',
    });
    expect(readSiyuanSummaryRoutePreference(storage, 'account', 'project', 'map-b')).toBeNull();
    expect(clearSiyuanSummaryRoutePreference(storage, 'account', 'project', 'map-a')).toBe(true);
    expect(readSiyuanSummaryRoutePreference(storage, 'account', 'project', 'map-a')).toBeNull();
  });

  it('persists an explicit local-first choice instead of falling back to the Chat route', () => {
    const storage = memoryStorage();
    expect(writeAutomaticSiyuanSummaryRoutePreference(storage, 'account', 'project', 'map-a')).toBe(
      true,
    );
    expect(readSiyuanSummaryRoutePreference(storage, 'account', 'project', 'map-a')).toEqual({
      mode: 'automatic',
    });
    expect(
      matchesSiyuanSummaryRoutePreference(
        readSiyuanSummaryRoutePreference(storage, 'account', 'project', 'map-a'),
        {
          providerId: 'opencode',
          connectionId: 'opencode-cli',
          modelId: 'opencode-go/deepseek-v4-flash-vision-exp',
          effort: 'high',
        },
      ),
    ).toBe(false);
  });

  it('fails closed for malformed scopes, routes, and stored data', () => {
    const storage = memoryStorage();
    expect(
      writeSiyuanSummaryRoutePreference(storage, 'account', 'project', 'map', {
        providerId: 'opencode',
        connectionId: 'opencode-cli',
        modelId: 'bad\nmodel',
        effort: 'auto',
      }),
    ).toBe(false);
    storage.setItem('vibespace.siyuan-summary-route-preferences.v1', '{broken');
    expect(readSiyuanSummaryRoutePreference(storage, 'account', 'project', 'map')).toBeNull();
  });
});

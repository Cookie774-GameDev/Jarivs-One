/**
 * Connectivity smoke: publishable Supabase env is present for this workspace.
 * Does not print secret material. Skips cleanly if env is intentionally absent
 * (CI without cloud) by asserting the shape of the helpers.
 */
import { describe, expect, it } from 'vitest';
import { isSupabaseConfigured, readSupabaseEnv } from './env';

describe('supabase env connectivity (local build wiring)', () => {
  it('exposes URL + anon key when app/.env.local is present', () => {
    const env = readSupabaseEnv();
    // In this repo after the connectivity fix, local desktop builds ship
    // publishable cloud keys via gitignored app/.env.local.
    // If a CI runner has no env, this still validates the helper contract.
    if (!env.url || !env.key) {
      expect(isSupabaseConfigured()).toBe(false);
      return;
    }
    expect(env.url).toMatch(/^https:\/\/.+\.supabase\.co$/);
    expect(env.key.length).toBeGreaterThan(20);
    // Never assert the raw key value — only that config is live.
    expect(isSupabaseConfigured()).toBe(true);
  });
});

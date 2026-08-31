import { describe, expect, it, vi } from 'vitest';

import { createAccountHydrationAuthority } from './accountHydrationAuthority';

describe('Jarvis account hydration authority', () => {
  it('deduplicates concurrent hydration and retains successful readiness', async () => {
    const hydrate = vi.fn(async () => undefined);
    const authority = createAccountHydrationAuthority(hydrate);
    await Promise.all([authority.ready('account-a'), authority.ready('account-a')]);
    await authority.ready('account-a');
    expect(hydrate).toHaveBeenCalledTimes(1);
  });

  it('fails closed and evicts a failed attempt so the next request retries', async () => {
    const hydrate = vi
      .fn<(_accountId: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(undefined);
    const authority = createAccountHydrationAuthority(hydrate);
    await expect(authority.ready('account-a')).resolves.toBe(false);
    await expect(authority.ready('account-a')).resolves.toBe(true);
    expect(hydrate).toHaveBeenCalledTimes(2);
  });

  it('invalidates successful readiness at an account boundary', async () => {
    const hydrate = vi.fn(async () => undefined);
    const authority = createAccountHydrationAuthority(hydrate);
    await authority.ready('account-a');
    authority.invalidate();
    await authority.ready('account-a');
    expect(hydrate).toHaveBeenCalledTimes(2);
  });
});

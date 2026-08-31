import { describe, expect, it, vi } from 'vitest';

import { reconcileDurableProfile } from './profilePersistenceRecovery';

describe('Jarvis learned-profile persistence recovery', () => {
  it('imports the exact durable profile after a failed optimistic save', async () => {
    const apply = vi.fn(() => true);
    const markdown = '# Jarvis Learning\n\n## Preferences\n- Durable preference';
    await expect(
      reconcileDurableProfile({
        load: async () => markdown,
        isCurrent: () => true,
        apply,
      }),
    ).resolves.toBe('reconciled');
    expect(apply).toHaveBeenCalledWith(markdown);
  });

  it('restores an empty durable profile when no file exists', async () => {
    const apply = vi.fn(() => true);
    await reconcileDurableProfile({ load: async () => null, isCurrent: () => true, apply });
    expect(apply).toHaveBeenCalledWith(expect.stringMatching(/^# Jarvis Learning\n/));
  });

  it('does not import after the active account changes', async () => {
    const apply = vi.fn(() => true);
    await expect(
      reconcileDurableProfile({
        load: async () => '# Jarvis Learning\n\nDurable',
        isCurrent: () => false,
        apply,
      }),
    ).resolves.toBe('stale');
    expect(apply).not.toHaveBeenCalled();
  });

  it('fails closed for an invalid or rejected durable payload', async () => {
    await expect(
      reconcileDurableProfile({
        load: async () => 'corrupt profile',
        isCurrent: () => true,
        apply: vi.fn(() => true),
      }),
    ).rejects.toThrow(/invalid/i);
    await expect(
      reconcileDurableProfile({
        load: async () => '# Jarvis Learning\n\nDurable',
        isCurrent: () => true,
        apply: () => false,
      }),
    ).rejects.toThrow(/rejected/i);
  });
});

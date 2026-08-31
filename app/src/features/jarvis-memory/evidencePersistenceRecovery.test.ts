import { describe, expect, it, vi } from 'vitest';

import { reconcileDurableEvidence } from './evidencePersistenceRecovery';
import type { MemoryEvidenceItem } from './types';

const item = (ownerId: string): MemoryEvidenceItem => ({
  id: 'evidence-1',
  ownerId,
  workspaceId: 'workspace-a',
  category: 'correction',
  content: 'Durable truth',
  sourceType: 'manual',
  sourceRef: { kind: 'manual', id: 'manual-1', label: 'Correction', occurredAt: 1 },
  confidence: 1,
  durabilityScore: 1,
  sensitivity: 'normal',
  status: 'approved',
  reinforcedCount: 1,
  createdAt: 1,
  updatedAt: 1,
});

describe('curated evidence persistence recovery', () => {
  it('hydrates the exact durable rows after a partial persistence failure', async () => {
    const apply = vi.fn();
    await expect(
      reconcileDurableEvidence({
        ownerId: 'account-a',
        list: async () => [item('account-a')],
        isCurrent: () => true,
        apply,
      }),
    ).resolves.toBe('reconciled');
    expect(apply).toHaveBeenCalledWith([item('account-a')]);
  });

  it('does not hydrate rows after the active account changes', async () => {
    const apply = vi.fn();
    await expect(
      reconcileDurableEvidence({
        ownerId: 'account-a',
        list: async () => [item('account-a')],
        isCurrent: () => false,
        apply,
      }),
    ).resolves.toBe('stale');
    expect(apply).not.toHaveBeenCalled();
  });

  it('fails closed when the repository returns a foreign-owner row', async () => {
    await expect(
      reconcileDurableEvidence({
        ownerId: 'account-a',
        list: async () => [item('account-b')],
        isCurrent: () => true,
        apply: vi.fn(),
      }),
    ).rejects.toThrow(/owner_mismatch/i);
  });
});

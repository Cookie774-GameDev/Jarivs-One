import type { MemoryEvidenceItem } from './types';

export async function reconcileDurableEvidence(input: {
  ownerId: string;
  list: (ownerId: string) => Promise<readonly MemoryEvidenceItem[]>;
  isCurrent: () => boolean;
  apply: (items: readonly MemoryEvidenceItem[]) => void;
}): Promise<'reconciled' | 'stale'> {
  const durable = await input.list(input.ownerId);
  if (!input.isCurrent()) return 'stale';
  if (durable.some((item) => item.ownerId !== input.ownerId)) {
    throw new Error('memory_evidence_recovery_owner_mismatch');
  }
  input.apply(durable);
  return 'reconciled';
}

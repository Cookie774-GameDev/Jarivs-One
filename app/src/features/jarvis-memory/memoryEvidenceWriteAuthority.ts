export interface MemoryEvidenceWriteToken {
  ownerId: string;
  epoch: number;
}

export function createMemoryEvidenceWriteAuthority(): {
  token: (ownerId: string) => MemoryEvidenceWriteToken;
  canWrite: (token: MemoryEvidenceWriteToken) => boolean;
  beginRecovery: (ownerId: string) => void;
  endRecovery: (ownerId: string) => void;
  invalidate: (ownerId: string) => void;
} {
  const epochs = new Map<string, number>();
  const recovering = new Set<string>();
  const bump = (ownerId: string) => epochs.set(ownerId, (epochs.get(ownerId) ?? 0) + 1);
  return {
    token: (ownerId) => ({ ownerId, epoch: epochs.get(ownerId) ?? 0 }),
    canWrite: (token) =>
      !recovering.has(token.ownerId) && (epochs.get(token.ownerId) ?? 0) === token.epoch,
    beginRecovery: (ownerId) => {
      bump(ownerId);
      recovering.add(ownerId);
    },
    endRecovery: (ownerId) => {
      bump(ownerId);
      recovering.delete(ownerId);
    },
    invalidate: (ownerId) => {
      bump(ownerId);
      recovering.delete(ownerId);
    },
  };
}

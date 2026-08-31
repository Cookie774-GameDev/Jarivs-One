import { describe, expect, it } from 'vitest';

import { createMemoryEvidenceWriteAuthority } from './memoryEvidenceWriteAuthority';

describe('memory evidence write authority', () => {
  it('invalidates queued and during-recovery writes but permits fresh post-recovery work', () => {
    const authority = createMemoryEvidenceWriteAuthority();
    const queued = authority.token('account-a');
    authority.beginRecovery('account-a');
    const duringRecovery = authority.token('account-a');
    expect(authority.canWrite(queued)).toBe(false);
    expect(authority.canWrite(duringRecovery)).toBe(false);
    authority.endRecovery('account-a');
    expect(authority.canWrite(duringRecovery)).toBe(false);
    expect(authority.canWrite(authority.token('account-a'))).toBe(true);
  });

  it('keeps recovery epochs isolated by account', () => {
    const authority = createMemoryEvidenceWriteAuthority();
    const otherAccount = authority.token('account-b');
    authority.beginRecovery('account-a');
    expect(authority.canWrite(otherAccount)).toBe(true);
  });

  it('invalidates account work explicitly at an identity boundary', () => {
    const authority = createMemoryEvidenceWriteAuthority();
    const token = authority.token('account-a');
    authority.invalidate('account-a');
    expect(authority.canWrite(token)).toBe(false);
  });
});

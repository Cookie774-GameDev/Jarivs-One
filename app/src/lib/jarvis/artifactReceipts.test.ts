import { describe, expect, it, vi } from 'vitest';
import {
  createArtifactReceiptAuthority,
  type ArtifactReceiptBinding,
  type ArtifactVerificationReceipt,
} from './artifactReceipts';

const NOW = 1_786_200_000_000;

function binding(overrides: Partial<ArtifactReceiptBinding> = {}): ArtifactReceiptBinding {
  return {
    accountId: 'account-alpha',
    runId: 'run-alpha',
    requestId: 'request-alpha',
    attemptNumber: 1,
    artifactId: 'jart_artifact-alpha',
    producerId: 'provider_response',
    resultRef: 'provider-result-alpha',
    artifactDigest: 'a'.repeat(64),
    verifiedAt: NOW,
    ...overrides,
  };
}

describe('private artifact receipt authority', () => {
  it('issues an opaque runtime object and binds the exact evidence once', () => {
    const randomUUID = vi.fn(() => 'receipt-alpha');
    const authority = createArtifactReceiptAuthority({ randomUUID, now: () => NOW + 1 });
    const exact = binding();
    const receipt = authority.issueReceipt(exact);

    expect(receipt).toEqual({ receiptId: 'jart_receipt-alpha', issuedAt: NOW + 1 });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(randomUUID).toHaveBeenCalledOnce();

    const verified = authority.verifyAndBindReceipt({ receipt, binding: { ...exact } });
    expect(verified).toMatchObject({
      ...exact,
      receiptId: 'jart_receipt-alpha',
      issuedAt: NOW + 1,
    });
    expect(Object.isFrozen(verified)).toBe(true);
    expect(authority.verifyAndBindReceipt({ receipt, binding: exact })).toBeNull();
  });

  it.each([
    ['accountId', 'account-beta'],
    ['runId', 'run-beta'],
    ['requestId', 'request-beta'],
    ['attemptNumber', 2],
    ['artifactId', 'jart_artifact-beta'],
    ['producerId', 'plugin_result'],
    ['resultRef', 'provider-result-beta'],
    ['artifactDigest', 'b'.repeat(64)],
    ['verifiedAt', NOW + 2],
  ] as const)('rejects a changed %s and revokes that receipt', (key, value) => {
    const authority = createArtifactReceiptAuthority({
      randomUUID: () => `receipt-${key}`,
      now: () => NOW + 1,
    });
    const exact = binding();
    const receipt = authority.issueReceipt(exact);

    expect(
      authority.verifyAndBindReceipt({
        receipt,
        binding: { ...exact, [key]: value },
      }),
    ).toBeNull();
    expect(authority.verifyAndBindReceipt({ receipt, binding: exact })).toBeNull();
  });

  it('rejects forged, cloned, and cross-authority receipt objects', () => {
    const first = createArtifactReceiptAuthority({ randomUUID: () => 'first', now: () => NOW });
    const second = createArtifactReceiptAuthority({ randomUUID: () => 'second', now: () => NOW });
    const exact = binding();
    const receipt = first.issueReceipt(exact);
    const forged = { ...receipt } as ArtifactVerificationReceipt;

    expect(first.verifyAndBindReceipt({ receipt: forged, binding: exact })).toBeNull();
    expect(second.verifyAndBindReceipt({ receipt, binding: exact })).toBeNull();
    expect(first.verifyAndBindReceipt({ receipt, binding: exact })).not.toBeNull();
  });

  it('mints independent fresh receipts from one authority', () => {
    let index = 0;
    const authority = createArtifactReceiptAuthority({
      randomUUID: () => `fresh-${++index}`,
      now: () => NOW + index,
    });
    const firstBinding = binding();
    const secondBinding = binding({ artifactId: 'jart_artifact-beta', resultRef: 'result-beta' });
    const first = authority.issueReceipt(firstBinding);
    const second = authority.issueReceipt(secondBinding);
    expect(first.receiptId).not.toBe(second.receiptId);
    expect(
      authority.verifyAndBindReceipt({ receipt: second, binding: secondBinding }),
    ).not.toBeNull();
    expect(
      authority.verifyAndBindReceipt({ receipt: first, binding: firstBinding }),
    ).not.toBeNull();
  });

  it.each([
    ['attemptNumber', 0],
    ['verifiedAt', -1],
    ['verifiedAt', NOW + 0.5],
    ['verifiedAt', Number.NaN],
    ['verifiedAt', Number.POSITIVE_INFINITY],
  ] as const)('rejects invalid numeric binding field %s', (key, value) => {
    const authority = createArtifactReceiptAuthority({
      randomUUID: () => 'invalid',
      now: () => NOW,
    });
    expect(() => authority.issueReceipt(binding({ [key]: value }))).toThrow(
      'artifact_receipt_binding_invalid',
    );
  });

  it.each([-1, NOW + 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid issuer timestamp %s without retaining a usable receipt',
    (timestamp) => {
      const authority = createArtifactReceiptAuthority({
        randomUUID: () => 'invalid-time',
        now: () => timestamp,
      });
      expect(() => authority.issueReceipt(binding())).toThrow('artifact_receipt_timestamp_invalid');
    },
  );
});

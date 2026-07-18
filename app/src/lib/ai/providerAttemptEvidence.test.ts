import { describe, expect, it, vi } from 'vitest';
import type { JarvisPreEffectTransportFailureEvidence } from '@/lib/jarvis/contracts';
import {
  createJarvisProviderAttemptEvidenceAuthority,
  type JarvisProviderAttemptFailureClassification,
} from '@/lib/ai/providerAttemptEvidence';

function digest(canonical: string): Promise<string> {
  return crypto.subtle
    .digest('SHA-256', new TextEncoder().encode(canonical))
    .then((value) =>
      Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    );
}

const binding = {
  accountId: 'account-1',
  runId: 'run-1',
  requestId: 'request-1',
  attemptNumber: 2,
  providerId: 'provider-1',
  modelId: 'model-1',
} as const;

const classificationBinding = {
  accountId: binding.accountId,
  runId: binding.runId,
  requestId: binding.requestId,
  attemptNumber: binding.attemptNumber,
} as const;

function failure(
  authority: ReturnType<typeof createJarvisProviderAttemptEvidenceAuthority>,
  observe?: (tracker: ReturnType<typeof authority.begin>) => void,
): Promise<JarvisProviderAttemptFailureClassification> {
  const tracker = authority.begin(binding);
  observe?.(tracker);
  return authority.classifyFailure(tracker, {
    failureCategory: 'network_unavailable',
    failedAt: 200,
  });
}

describe('provider attempt evidence authority', () => {
  it('issues exact-bound content-addressed evidence only before any observation', async () => {
    const sha256 = vi.fn(digest);
    const authority = createJarvisProviderAttemptEvidenceAuthority({ sha256 });
    const tracker = authority.begin(binding);

    expect(authority.verifyActiveEvidence(binding)).toBe(true);
    const classification = await authority.classifyFailure(tracker, {
      failureCategory: 'network_unavailable',
      failedAt: 200,
    });

    expect(classification.kind).toBe('pre_effect_transport_failure');
    if (classification.kind !== 'pre_effect_transport_failure') {
      throw new Error('unexpected classification');
    }
    expect(classification.evidence).toEqual({
      schemaVersion: 1,
      ...binding,
      boundary: 'before_first_response_byte',
      responseStarted: false,
      chunkCount: 0,
      actionDispatchCount: 0,
      failureCategory: 'network_unavailable',
      evidenceRef: `sha256:${await digest(
        JSON.stringify({
          schemaVersion: 1,
          ...binding,
          boundary: 'before_first_response_byte',
          responseStarted: false,
          chunkCount: 0,
          actionDispatchCount: 0,
          failureCategory: 'network_unavailable',
          verifiedAt: 200,
        }),
      )}`,
      verifiedAt: 200,
    });
    expect(Object.isFrozen(classification)).toBe(true);
    expect(Object.isFrozen(classification.evidence)).toBe(true);
    expect(sha256).toHaveBeenCalledTimes(1);
    expect(authority.verifyActiveEvidence(binding)).toBe(false);
  });

  it.each([
    [
      'one byte',
      (
        authority: ReturnType<typeof createJarvisProviderAttemptEvidenceAuthority>,
        tracker: ReturnType<
          ReturnType<typeof createJarvisProviderAttemptEvidenceAuthority>['begin']
        >,
      ) =>
        authority.noteResponseObservation(tracker, {
          kind: 'bytes',
          byteLength: 1,
          observedAt: 150,
        }),
    ],
    [
      'one SDK chunk',
      (
        authority: ReturnType<typeof createJarvisProviderAttemptEvidenceAuthority>,
        tracker: ReturnType<
          ReturnType<typeof createJarvisProviderAttemptEvidenceAuthority>['begin']
        >,
      ) => authority.noteResponseObservation(tracker, { kind: 'sdk_chunk', observedAt: 150 }),
    ],
    [
      'multiple chunks',
      (
        authority: ReturnType<typeof createJarvisProviderAttemptEvidenceAuthority>,
        tracker: ReturnType<
          ReturnType<typeof createJarvisProviderAttemptEvidenceAuthority>['begin']
        >,
      ) => {
        authority.noteResponseObservation(tracker, {
          kind: 'bytes',
          byteLength: 1,
          observedAt: 150,
        });
        authority.noteResponseObservation(tracker, {
          kind: 'bytes',
          byteLength: 2,
          observedAt: 151,
        });
      },
    ],
  ])('denies retry evidence after %s', async (_name, observe) => {
    const authority = createJarvisProviderAttemptEvidenceAuthority({ sha256: digest });
    const classification = await failure(authority, (tracker) => observe(authority, tracker));

    expect(classification).toMatchObject({
      kind: 'response_started_transport_failure',
      ...classificationBinding,
      responseStarted: true,
      actionDispatchCount: 0,
      failureCategory: 'network_unavailable',
      failedAt: 200,
    });
    expect(classification).not.toHaveProperty('evidence');
  });

  it('denies retry evidence after any action dispatch observation', async () => {
    const authority = createJarvisProviderAttemptEvidenceAuthority({ sha256: digest });
    const classification = await failure(authority, (tracker) => {
      authority.noteActionDispatch(tracker, { observedAt: 175 });
    });

    expect(classification).toEqual({
      kind: 'action_dispatch_started_transport_failure',
      ...classificationBinding,
      responseStarted: false,
      chunkCount: 0,
      actionDispatchCount: 1,
      failureCategory: 'network_unavailable',
      failedAt: 200,
    });
    expect(classification).not.toHaveProperty('evidence');
  });

  it('prioritizes action-dispatch classification after both observations', async () => {
    const authority = createJarvisProviderAttemptEvidenceAuthority({ sha256: digest });
    const classification = await failure(authority, (tracker) => {
      authority.noteResponseObservation(tracker, { kind: 'sdk_chunk', observedAt: 150 });
      authority.noteActionDispatch(tracker, { observedAt: 175 });
    });

    expect(classification).toMatchObject({
      kind: 'action_dispatch_started_transport_failure',
      responseStarted: true,
      chunkCount: 1,
      actionDispatchCount: 1,
    });
  });

  it('revalidates durable evidence without a live tracker', async () => {
    const issuer = createJarvisProviderAttemptEvidenceAuthority({ sha256: digest });
    const classification = await failure(issuer);
    if (classification.kind !== 'pre_effect_transport_failure') {
      throw new Error('unexpected classification');
    }
    issuer.invalidateAll();
    const restarted = createJarvisProviderAttemptEvidenceAuthority({ sha256: digest });

    await expect(
      restarted.revalidateFailure({ evidence: classification.evidence, ...binding }),
    ).resolves.toEqual(classification.evidence);
  });

  it.each([
    ['accountId', 'account-2'],
    ['runId', 'run-2'],
    ['requestId', 'request-2'],
    ['attemptNumber', 3],
    ['providerId', 'provider-2'],
    ['modelId', 'model-2'],
    ['failureCategory', 'different_category'],
    ['evidenceRef', `sha256:${'0'.repeat(64)}`],
    ['verifiedAt', 201],
    ['responseStarted', true],
    ['chunkCount', 1],
    ['actionDispatchCount', 1],
    ['boundary', 'after_first_response_byte'],
  ])('rejects tampered durable evidence field %s', async (field, value) => {
    const authority = createJarvisProviderAttemptEvidenceAuthority({ sha256: digest });
    const classification = await failure(authority);
    if (classification.kind !== 'pre_effect_transport_failure') {
      throw new Error('unexpected classification');
    }
    const tampered = {
      ...classification.evidence,
      [field]: value,
    } as unknown as JarvisPreEffectTransportFailureEvidence;

    await expect(
      authority.revalidateFailure({ evidence: tampered, ...binding }),
    ).resolves.toBeNull();
  });

  it('fails closed for ambiguous duplicate active bindings', () => {
    const authority = createJarvisProviderAttemptEvidenceAuthority({ sha256: digest });
    const first = authority.begin(binding);
    const second = authority.begin(binding);

    expect(authority.verifyActiveEvidence(binding)).toBe(false);
    authority.complete(first);
    expect(authority.verifyActiveEvidence(binding)).toBe(true);
    authority.complete(second);
    expect(authority.verifyActiveEvidence(binding)).toBe(false);
  });

  it('rejects invalid observations, unsafe categories, and tracker reuse', async () => {
    const authority = createJarvisProviderAttemptEvidenceAuthority({ sha256: digest });
    const tracker = authority.begin(binding);

    expect(() =>
      authority.noteResponseObservation(tracker, {
        kind: 'bytes',
        byteLength: 0,
        observedAt: 150,
      }),
    ).toThrow();
    await expect(
      authority.classifyFailure(tracker, {
        failureCategory: 'raw error\nwith body',
        failedAt: 200,
      }),
    ).rejects.toThrow();
    authority.complete(tracker);
    expect(() => authority.noteActionDispatch(tracker, { observedAt: 201 })).toThrow();
    await expect(
      authority.classifyFailure(tracker, {
        failureCategory: 'network_unavailable',
        failedAt: 202,
      }),
    ).rejects.toThrow();
  });
});
